# Kiwoom long account collector

Reads only ust21070, ust21120 and ust21180 on api.kiwoom.com. No order/transfer route exists.
Private keys and snapshots must stay outside the repository and OneDrive.
Configure TJ_KIWOOM_DATA_DIR, TJ_KIWOOM_CREDENTIALS and TJ_FEED_CODE_PATH.
Run collect.mjs once per scheduled invocation; the private-store lock prevents overlapping runs.
2026 history is fetched in calendar-month windows (broker maximum: three months), with continuation checked.
The source returns order dates, not exact fill times: the feed labels that limitation and never guesses fees or realized profit.
Long account valuation is the broker-provided KRW estimated assets for overseas securities and deposits, not all household wealth or domestic stock holdings.
Cloud publication uses separate kiwoom-data/kiwoom-status records and verifies readback before success. Keys and raw account/order identifiers are never published.
