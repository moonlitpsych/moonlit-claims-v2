# Moonlit – Claims Tracking System (Office Ally + X12) – Implementation Spec

> Portable handoff for LLM coding agents. Postgres/Supabase-first. Event‑sourced claim lifecycle using OA artifacts (837, 999, 277CA, 276/277, 835). Avoids payer‑specific logic; prefer standards with configurable dictionaries.

---

## 0) Goals & Non‑Goals

**Goals**

* End‑to‑end claim tracking from submission → adjudication with auditable timeline.
* Deterministic matching of ERAs (835) and status (277) to internal claims.
* Clear source‑of‑truth for money (allowed/paid/PR/adjustments) and status.
* Idempotent ingestion, safe reprocessing, full raw‑file retention.

**Non‑Goals**

* Building an 837 generator (assume it already exists via OA).
* Payer‑specific appeal logic.

---

## 1) Schema (Postgres / Supabase)

> Naming uses `snake_case`. Use UUIDs (Supabase default). All timestamps are `timestamptz` in UTC. Where feasible, include `created_at`/`updated_at` triggers.

### 1.1 Core entities

```sql
-- Payers catalog (simplified; assumed to exist but shown for completeness)
create table if not exists payers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  edi_id text,                 -- X12 payer ID (ISA/GS level routing)
  oa_payer_id text,            -- Office Ally internal payer code
  type text check (type in ('medicaid','medicare','commercial','selfpay')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Patients (assumed exists). Include minimal fields used for matching.
create table if not exists patients (
  id uuid primary key,
  first_name text,
  last_name text,
  dob date,
  member_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Claims header (one row per 837 claim)
create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  payer_id uuid not null references payers(id),
  subscriber_id text,              -- Member/Subscriber ID
  dos_from date not null,
  dos_to date not null,
  place_of_service text,
  billing_npi text not null,
  billing_tin text not null,
  rendering_npi text,
  taxonomy text,
  submitted_charge_total numeric(12,2) not null,
  clm01 text not null,             -- Patient Control Number we sent on 837
  oa_claim_id text,                -- OA claim identifier (for OA support only)
  oa_batch_id text,                -- OA batch/file identifier
  status text not null default 'submitted' check (status in (
    'draft','submitted','clearinghouse_rejected','payer_rejected','accepted','in_process','pended','denied','partial','paid','adjusted','void'
  )),
  status_updated_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on claims (payer_id);
create index on claims (patient_id);
create index on claims (billing_npi);
create index on claims (clm01);
create index on claims (dos_from, dos_to);

-- Detail lines from our submission (for financial rollups & auditing)
create table if not exists claim_lines (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  seq int not null,                        -- 1..N per claim
  cpt text not null,
  modifiers text[] default '{}',
  units numeric(10,2) default 1,
  charge_amt numeric(12,2) not null,
  dx_ptr smallint[] default '{}',
  created_at timestamptz default now()
);
create unique index on claim_lines (claim_id, seq);

-- Cross‑system identifiers (payer ICN/TCN/CCN, OA, internal)
create table if not exists claim_identifiers (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  system text not null check (system in ('payer','oa','internal')),
  id_type text not null check (id_type in ('ICN','TCN','CCN','DCN','CLM01','OTHER')),
  value text not null,
  created_at timestamptz default now()
);
create index on claim_identifiers (system, id_type, value);

-- Append‑only event log
create table if not exists claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  event_type text not null check (event_type in (
    'submitted_837','ack_999','reject_277ca','accept_277ca','status_277',
    'remit_835_header','remit_835_detail','void','corrected'
  )),
  occurred_at timestamptz not null,
  raw_file_id uuid,                   -- FK to raw_files (see 1.3)
  details jsonb default '{}'::jsonb,  -- parsed/normalized payload
  hash_sha256 text not null,          -- idempotency (hash of raw content or tuple)
  created_at timestamptz default now(),
  unique (claim_id, event_type, hash_sha256)
);
create index on claim_events (event_type, occurred_at);

-- CARC/RARC dictionaries (reference data)
create table if not exists carc_codes (
  code text primary key, description text
);
create table if not exists rarc_codes (
  code text primary key, description text
);
```

### 1.2 Remittance (835) storage

```sql
-- ERA file header (BPR/TRN)
create table if not exists remits_835 (
  id uuid primary key default gen_random_uuid(),
  payer_id uuid references payers(id),
  payment_date date,
  payment_method text,     -- CHK/EFT
  check_number text,
  eft_trn text,
  total_paid numeric(14,2),
  raw_file_id uuid,        -- FK to raw_files
  created_at timestamptz default now()
);

-- Claim‑level CLP/REF within an ERA
create table if not exists remit_claims (
  id uuid primary key default gen_random_uuid(),
  remit_id uuid not null references remits_835(id) on delete cascade,
  claim_id uuid,                      -- nullable; matched later
  payer_icn text,                     -- from REF*1K or CLP07 where applicable
  patient_control_no text,            -- CLP01 (our CLM01)
  claim_status_code text,             -- CLP02
  claim_charge_amt numeric(12,2),     -- CLP03
  claim_paid_amt numeric(12,2),       -- CLP04
  patient_resp_amt numeric(12,2),     -- CLP05
  facility_type text,                 -- CLP06 (POS)
  payer_claim_control text,           -- duplicate of REF*1K when present
  created_at timestamptz default now()
);
create index on remit_claims (payer_icn);
create index on remit_claims (patient_control_no);

-- Line‑level SVC/CAS/RARC
create table if not exists remit_lines (
  id uuid primary key default gen_random_uuid(),
  remit_claim_id uuid not null references remit_claims(id) on delete cascade,
  seq int not null,
  svc_cpt text,
  svc_units numeric(10,2),
  svc_charge numeric(12,2),
  svc_paid numeric(12,2),
  allowed_amt numeric(12,2),
  carc jsonb default '[]'::jsonb,
  rarc jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (remit_claim_id, seq)
);
```

### 1.3 Raw files repository (idempotent ingestion)

```sql
create table if not exists raw_files (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('oa_sftp','oa_api','manual_upload')),
  filename text not null,
  payload bytea not null,            -- store exact X12 or zip; or use storage bucket and keep a hash
  sha256 text not null unique,
  received_at timestamptz default now()
);
```

### 1.4 Derived views

```sql
-- Roll up financials per claim (from matched 835 data)
create materialized view if not exists v_claim_financials as
select c.id as claim_id,
       coalesce(sum(rc.claim_charge_amt),0) as claim_charge,
       coalesce(sum(rc.claim_paid_amt),0)   as claim_paid,
       coalesce(sum(rc.patient_resp_amt),0) as patient_resp
from claims c
left join remit_claims rc on rc.claim_id = c.id
group by c.id;

-- Latest adjudication signal from events (preference order applied in a function)
create or replace function derive_claim_status(p_claim_id uuid)
returns text language sql as $$
  with e as (
    select event_type, occurred_at
    from claim_events
    where claim_id = p_claim_id
    order by occurred_at desc
  )
  select coalesce((
    select case
      when exists (select 1 from e where event_type = 'remit_835_detail') then 'paid'
      when exists (select 1 from e where event_type = 'reject_277ca') then 'payer_rejected'
      when exists (select 1 from e where event_type = 'accept_277ca') then 'accepted'
      when exists (select 1 from e where event_type = 'status_277') then 'in_process'
      when exists (select 1 from e where event_type = 'ack_999') then 'submitted'
      else 'submitted'
    end
  ), 'submitted');
$$;

create or replace view v_claim_status as
select c.*, derive_claim_status(c.id) as derived_status
from claims c;
```

> **Note:** In production, refine precedence: `paid/partial/denied` from CLP02 outranks others; store explicit `pended` from 277 when present.

---

## 2) Matching & Idempotency

### 2.1 Claim matching priority

1. **REF*1K payer claim control (ICN/TCN)** ↔ `claim_identifiers(system='payer', id_type in ('ICN','TCN','CCN'))`.
2. **CLP01 (patient control #)** ↔ `claims.clm01`.
3. Fallback tuple: `(patient.member_id, DOS range overlap, submitted_charge_total)` and optionally `billing_npi`.

### 2.2 Idempotent inserts

* Compute `sha256` over raw X12 file contents. If already present in `raw_files`, skip re‑parse.
* For events, add uniqueness on `(claim_id, event_type, hash_sha256)`.

---

## 3) Ingestion Pipeline (Jobs)

1. **submit_837** → store `claims` + `claim_lines` + identifiers (`CLM01`, `oa_claim_id`, `oa_batch_id`); emit `submitted_837`.
2. **pull_999_277ca** (OA API/portal): parse and emit `ack_999` and `accept_277ca`/`reject_277ca` events. If reject, attach error codes to `details`.
3. **poll_276_277** (OA real‑time where available): construct queries by member/DOB/DOS/(billing NPI). Persist each reply as `status_277` with normalized status and any **payer ICN** when it first appears.
4. **pull_835** (OA SFTP nightly): parse ERA(s) → `remits_835` → `remit_claims` → `remit_lines`. Attempt match; if unresolved, leave `claim_id` NULL and queue a reconciliation job.
5. **reconcile_835_to_claims**: run the priority matcher; backfill `claim_identifiers` with REF*1K when found; update `claims.status` and touch `status_updated_at`.
6. **refresh_materializations**: refresh `v_claim_financials` on schedule; or replace with trigger‑based rollups.

---

## 4) Normalization Maps (X12 → DB)

### 4.1 835 (ERA) mapping

* **BPR/TRN** → `remits_835.payment_method`, `check_number`, `eft_trn`, `payment_date`, `total_paid`.
* **CLP** → `remit_claims`: `CLP01`→`patient_control_no`, `CLP02`→`claim_status_code`, `CLP03`→`claim_charge_amt`, `CLP04`→`claim_paid_amt`, `CLP05`→`patient_resp_amt`, `CLP06`→`facility_type`.
* **REF*1K** (Payer Claim Control) → `remit_claims.payer_icn` + `claim_identifiers` (system='payer', id_type='ICN').
* **SVC** (per service line) → `remit_lines.svc_*`.
* **CAS** → append to `remit_lines.carc` as array of `{group, code, amount, quantity}` objects; cross‑link to `carc_codes`.
* **LQ AMT** / **AMT** (allowed) when present → `remit_lines.allowed_amt`.

### 4.2 277 (status) mapping

* High‑level normalize to `{lifecycle_code, description, followup_action, pended: bool}`; store raw segments in `details.segments` for audit.
* Capture payer ICN when present (e.g., `STC`/`REF` variants) and insert into `claim_identifiers`.

---

## 5) Sample Upsert Helpers (SQL)

```sql
-- Save or find a payer ICN for claim
create or replace function upsert_payer_icn(p_claim_id uuid, p_icn text)
returns void language plpgsql as $$
begin
  insert into claim_identifiers (claim_id, system, id_type, value)
  values (p_claim_id, 'payer', 'ICN', p_icn)
  on conflict do nothing;
end;$$;

-- Record an event (idempotent by hash)
create or replace function record_event(
  p_claim_id uuid,
  p_type text,
  p_occurred_at timestamptz,
  p_raw_file_id uuid,
  p_details jsonb,
  p_hash text
) returns void language plpgsql as $$
begin
  insert into claim_events (claim_id, event_type, occurred_at, raw_file_id, details, hash_sha256)
  values (p_claim_id, p_type, p_occurred_at, p_raw_file_id, p_details, p_hash)
  on conflict do nothing;
end;$$;
```

---

## 6) Parser Sketches (Language‑agnostic + Example Implementations)

> You can implement in Node/TS or Python. Below are outlines for both. Use a battle‑tested X12 parser where possible; otherwise split on `~` segments and `*` elements and be careful with ISA/GS delimiters.

### 6.1 Deterministic file hashing

```pseudo
bytes = read_file()
sha256 = SHA256(bytes)
if raw_files.exists(sha256): return    -- already processed
raw_id = raw_files.insert(source, filename, bytes, sha256)
```

### 6.2 835 ERA → DB (pseudocode)

```pseudo
function ingest_835(file_bytes, filename):
  sha = sha256(file_bytes)
  if exists raw_files.sha256 = sha: return
  raw_id = insert_raw_file('oa_sftp', filename, file_bytes, sha)

  doc = x12.parse835(file_bytes)
  remit_id = insert remits_835 using BPR/TRN totals

  for each claim in doc.claims:
    rclaim_id = insert remit_claims (remit_id, CLP*, REF*1K)
    try_match_claim(rclaim_id)
    for each line in claim.lines:
      insert remit_lines (SVC, CAS[], AMT allowed)

  create claim_events for header/detail with occurred_at = payment_date
```

**TypeScript sketch** (Node):

```ts
import { createHash } from 'crypto';
import { Pool } from 'pg';
import { parse835 } from './x12/era835'; // implement with a small parser

export async function ingest835(buf: Buffer, filename: string) {
  const sha = createHash('sha256').update(buf).digest('hex');
  const db = new Pool();
  const exists = await db.query('select id from raw_files where sha256=$1', [sha]);
  if (exists.rowCount) return; // idempotent

  const raw = await db.query(
    'insert into raw_files(source, filename, payload, sha256) values($1,$2,$3,$4) returning id',
    ['oa_sftp', filename, buf, sha]
  );
  const rawId = raw.rows[0].id;

  const era = parse835(buf.toString('utf8'));
  const remit = await db.query(
    `insert into remits_835(payer_id, payment_date, payment_method, check_number, eft_trn, total_paid, raw_file_id)
     values($1,$2,$3,$4,$5,$6,$7) returning id`,
    [era.payerId, era.paymentDate, era.paymentMethod, era.checkNumber, era.trn, era.totalPaid, rawId]
  );
  const remitId = remit.rows[0].id;

  for (const clm of era.claims) {
    const r = await db.query(
      `insert into remit_claims(remit_id, payer_icn, patient_control_no, claim_status_code, claim_charge_amt, claim_paid_amt, patient_resp_amt, payer_claim_control)
       values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [remitId, clm.payerICN, clm.patientControlNo, clm.statusCode, clm.charge, clm.paid, clm.patientResp, clm.payerClaimControl]
    );
    const rcId = r.rows[0].id;

    await tryMatchClaim(db, rcId, clm);

    let i = 1;
    for (const ln of clm.lines) {
      await db.query(
        `insert into remit_lines(remit_claim_id, seq, svc_cpt, svc_units, svc_charge, svc_paid, allowed_amt, carc, rarc)
         values($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`,
        [rcId, i++, ln.cpt, ln.units, ln.charge, ln.paid, ln.allowed, JSON.stringify(ln.carc), JSON.stringify(ln.rarc)]
      );
    }
  }
}
```

**Match helper** (priority: REF*1K → CLP01 → fallback)

```ts
async function tryMatchClaim(db: Pool, rcId: string, clm: EraClaim) {
  let q = await db.query(`
    select c.id from claim_identifiers ci
    join claims c on c.id = ci.claim_id
    where ci.system='payer' and ci.id_type in ('ICN','TCN','CCN') and ci.value=$1
    limit 1`, [clm.payerICN]);
  if (!q.rowCount && clm.patientControlNo) {
    q = await db.query(`select id from claims where clm01 = $1 limit 1`, [clm.patientControlNo]);
  }
  if (!q.rowCount) {
    q = await db.query(`
      select id from claims
      where subscriber_id = $1 and $2::date between dos_from and dos_to
        and abs(submitted_charge_total - $3::numeric) < 0.01
      limit 1`, [clm.memberId, clm.dos, clm.charge]);
  }
  if (q.rowCount) {
    const claimId = q.rows[0].id;
    await db.query(`update remit_claims set claim_id=$1 where id=$2`, [claimId, rcId]);
    if (clm.payerICN) {
      await db.query(`select upsert_payer_icn($1,$2)`, [claimId, clm.payerICN]);
    }
  }
}
```

### 6.3 277 (status) → DB (pseudocode)

```pseudo
function ingest_277(file_bytes, filename):
  raw_id = ensure_raw_file()
  doc = x12.parse277(file_bytes)
  for each claim_status in doc.claims:
    claim_id = match_by_icn_or_clm01_or_tuple()
    details = normalize_277(claim_status)  -- {lifecycle, pended?, msg, codes}
    record_event(claim_id, 'status_277', now(), raw_id, details, hash)
    if details.icn: upsert_payer_icn(claim_id, details.icn)
```

---

## 7) Status Derivation & UI

**Precedence (high → low):**

* From 835: `CLP02` → `paid | partial | denied` (exact mapping below).
* From 277: `pended` (medical records / info requested), else `in_process`.
* From 277CA: `payer_rejected` or `accepted`.
* From 999: `submitted` (valid syntax).

**CLP02 map (common):** `1=paid`, `2=denied`, `3=partial`, `4=pended`, `22=reversal`, etc. Store raw code and render human text.

**UI panels:**

* Header (Patient • Payer • DOS • Current Status badge).
* Locator (Payer ICN • OA Claim ID • CLM01 • Billing NPI/TIN).
* Money (Billed → Allowed → Paid → Patient Resp → Adjustments by CARC).
* Timeline (events with timestamps; link each to raw segment).
* Documents (download raw X12; link to parsed JSON view).

---

## 8) OA Integration Notes

* **835 delivery**: Prefer OA SFTP drop (daily). Poll a secure folder; move processed files to an archival folder after hashing and recording.
* **999/277CA**: Pull via OA API/portal export; treat each file as a separate `raw_file` and emit events.
* **276/277**: Use OA’s real‑time gateway where available. Construct queries with: member ID, patient name + DOB, DOS (from/to), billing NPI, optionally billed amount. Persist every response.
* Keep **OA identifiers** strictly for tracing; never surface them as the payer “claim number.”

---

## 9) Operational Concerns

* **Security/PHI**: Store raw files encrypted at rest. Restrict table access to service roles. Log all downloads of `raw_files`.
* **Reprocessing**: Safe to re‑run ingest jobs; idempotency via `raw_files.sha256` and `claim_events.unique` protects from dupes.
* **Observability**: Emit metrics per job (files processed, claims matched, unmatched, errors by payer). Create an “Unmatched ERA claims” dashboard.
* **Testing**: Build fixtures of redacted ERAs/277s. Unit test parsers and the matcher.

---

## 10) Sample Fixtures (Redacted)

### 10.1 Example normalized 835 claim JSON (stored in `details` on event or sidecar)

```json
{
  "payerICN": "2599212269",
  "patientControlNo": "C44472",
  "statusCode": "1",
  "charge": 775.00,
  "paid": 308.07,
  "patientResp": 0.00,
  "lines": [
    {
      "seq": 1,
      "cpt": "99205",
      "units": 1,
      "charge": 450.00,
      "paid": 167.27,
      "allowed": 167.27,
      "carc": [{"group":"CO","code":"45","amount":282.73}],
      "rarc": []
    }
  ]
}
```

### 10.2 Example normalized 277 status JSON

```json
{
  "lifecycle": "in_process",
  "pended": false,
  "message": "Accepted for adjudication",
  "icn": "2599212269",
  "codes": [{"code":"A1","context":"STC"}]
}
```

---

## 11) Implementation Checklist (for agents)

* [ ] Create tables and indexes (Section 1).
* [ ] Build SFTP poller → store files into `raw_files`.
* [ ] Implement `ingest_835` and `ingest_277` (Section 6) with idempotency.
* [ ] Implement `tryMatchClaim` with priority rules (Section 2.1).
* [ ] Emit `claim_events` and update `claims.status` via `derive_claim_status` (or a background job that sets explicit statuses).
* [ ] Expose admin UI: unmatched ERA claims; claim timeline; money box.
* [ ] Load CARC/RARC dictionaries; render human‑readable adjustments.
* [ ] Wire alerts for `reject_277ca` and `pended` statuses.

---

## 12) FAQ (Ops)

**Billed amount** = the charges you submitted on the 837 (matches EOB’s “Billed Amount”).
**Which NPI to use for lookups?** Start with **billing/group NPI** + TIN; keep rendering NPI for payers that require it.
**Claim number asked by payer?** Give the **payer ICN/TCN/CCN** (from REF*1K/ERA). If unknown, search by member + DOB + DOS (+ billed amount, NPI).

---

**End of spec** – safe to hand to agents.
