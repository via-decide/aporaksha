# DPDP control matrix

| CONTROL_ID | ACT/RULE | REQUIREMENT | SYSTEM | IMPLEMENTATION | TEST | EVIDENCE | STATUS | OWNER | LEGAL_REVIEW |
|---|---|---|---|---|---|---|---|---|---|
| ID-01 | Act rights/security | authenticated principal | Aporaksha | signed token + durable session/JTI | privacy authorization tests partial | `privacy-auth.js` | IMPLEMENTED | Identity | no |
| CON-01 | Act consent | affirmative purpose evidence/withdrawal | Aporaksha | append-only state rows | `privacy.test.js` | consent/audit rows | IMPLEMENTED | Privacy | basis mapping yes |
| RGT-01 | Act rights | access/correction | Aporaksha | curated report/display-name correction | tests partial | route + DB | PARTIAL | Privacy | yes |
| ERA-01 | Act erasure | discover/classify/revoke/evidence | Aporaksha/VIA | local partial workflow; VIA/adapters missing | tests incomplete | opaque evidence | BLOCKED | Privacy | retention yes |
| GRV-01 | Act/Rules grievance | private grievance/redress | Aporaksha | authenticated row; public recovery missing | tests incomplete | DB | PARTIAL | Support | language yes |
| NOM-01 | Act nomination | principal-controlled record | Aporaksha | create/update/revoke; no authority | tests incomplete | opaque audit | PARTIAL | Privacy | proof process yes |
| CHD-01 | Act child | under-18 gate | Signup | boolean affirmation before insert; no DOB | auth regression required | route | PARTIAL | Identity | guardian flow yes |
| RET-01 | Rules/security | retention/minimum/holds | stores | bounded expired-session adapter only | command | output | BLOCKED | Operations | policy yes |
| BR-01 | Rules breach | persistent workflow/72h proof | Aporaksha | confirmed fixture + separate principals/manual Board | unit test | DB/package | PARTIAL | Security | notice/report yes |
| CFG-01 | Rules notice/contact | entity/contact configuration | Production | validator exists; startup wiring missing | unit test | env contract | BLOCKED_CONFIG | Operations | entity input |
| LANG-01 | Rules notice | approved language | UI | not supplied | none | none | BLOCKED_LEGAL | Legal | yes |
