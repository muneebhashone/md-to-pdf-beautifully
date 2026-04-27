# Diagrams That Must Fit

A small flowchart first, then a deliberately oversized sequence diagram so we can prove fit-to-page works.

## Small flowchart

```mermaid
flowchart LR
  A[Idea] --> B{Worth it?}
  B -- yes --> C[Build]
  B -- no --> D[Park it]
  C --> E[Ship]
  E --> F((Fin))
```

## Wide sequence diagram

This one is intentionally wide — many actors, many round-trips. It must not overflow horizontally.

```mermaid
sequenceDiagram
  autonumber
  participant U as User
  participant W as Web
  participant G as Gateway
  participant A as Auth
  participant O as Orders
  participant I as Inventory
  participant P as Payments
  participant S as Shipping
  participant N as Notifications
  participant L as Ledger
  U->>W: Click "Buy"
  W->>G: POST /checkout
  G->>A: verify(token)
  A-->>G: ok
  G->>O: create(order)
  O->>I: reserve(items)
  I-->>O: reserved
  O->>P: charge(amount)
  P-->>O: captured
  O->>L: record(txn)
  O->>S: schedule(shipment)
  S-->>O: queued
  O->>N: notify(user)
  N-->>U: email
  O-->>G: 201 Created
  G-->>W: { order_id }
  W-->>U: receipt
```

## Tall flowchart

This one is intentionally tall — many vertical levels — to confirm we also clip vertically.

```mermaid
flowchart TB
  s1[Step 1] --> s2[Step 2] --> s3[Step 3] --> s4[Step 4] --> s5[Step 5]
  s5 --> s6[Step 6] --> s7[Step 7] --> s8[Step 8] --> s9[Step 9] --> s10[Step 10]
  s10 --> s11[Step 11] --> s12[Step 12] --> s13[Step 13] --> s14[Step 14] --> s15[Step 15]
  s15 --> s16[Step 16] --> s17[Step 17] --> s18[Step 18] --> s19[Step 19] --> s20[Step 20]
  s20 --> s21[Step 21] --> s22[Step 22] --> s23[Step 23] --> s24[Step 24] --> s25[Step 25]
```
