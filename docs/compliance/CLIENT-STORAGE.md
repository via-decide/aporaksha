# Client storage

Passport scripts use browser storage for authentication/passport/cache state. Exact keys and TTLs require a separate client scan. Authorization never treats these values as identity proof: the server verifies bearer tokens and durable sessions. Cookies, analytics SDK behavior and consent-banner state are **UNKNOWN**; no claim of absence is made.
