# Kiwoom long account collector

Reads only ust21070, ust21120, ust21180 (US account) and kt00009 (domestic account order/fill status) on api.kiwoom.com. No order/transfer route exists: client.mjs READ_ONLY is the whole allow list and anything else throws before the network.
Private keys and snapshots must stay outside the repository and OneDrive.
Configure TJ_KIWOOM_DATA_DIR, TJ_FEED_CODE_PATH and keys: either TJ_KIWOOM_CREDENTIALS (JSON with appkey/secretkey) or
TJ_KIWOOM_KEY_DIR + TJ_KIWOOM_KEY_LAST4 — the folder the market board also reads (<account>_appkey.txt, <account>_secretkey.txt),
used only when exactly one account there ends with LAST4 (keys.mjs). That folder is only read. Answers lose any acnt_no field before the snapshot.
On this PC: C:/TradeJournalData/collector.env (shared with Toss), task TradeJournal-Kiwoom-Collector every 10 minutes at minute 4
(one run per invocation, not --watch; MarketBoardAutoRefresh reads the same keys at minute :09/:24/:39/:54 + ~2 s).
Run collect.mjs once per scheduled invocation; the private-store lock prevents overlapping runs.
Requests are spaced 1.1 s apart: Kiwoom answers 1700 ("유량=1") when one API ID is asked faster than once a second.
An empty history answers return_code 20 with 501724 (kt00009) or 571758 (ust21180); only those two messages are read as "no rows".
US: 2026 history is fetched in calendar-month windows (broker maximum: three months), with continuation checked.
The US source returns order dates, not exact fill times: the feed labels that limitation and never guesses fees or realized profit.
Domestic: kt00009 is asked one order date (weekday) at a time and only reaches back two months (506424), so the first run starts 59 days back (never before 2026-01-01), at most 45 days per run.
Each later run asks the last checked day again plus any newer days; an asked day is replaced by the broker's answer. Domestic rows carry KRW, the 6-digit code, name, side, filled quantity, fill price and fill time (cntr_tm, Korea time); fees stay pending.
Long account valuation is the broker-provided KRW estimated assets for overseas securities and deposits, not all household wealth or domestic stock holdings.
Cloud publication uses separate kiwoom-data/kiwoom-status records and verifies readback before success. Keys and raw account/order identifiers are never published.
API reference: github.com/Kiwoom-Securities/Kiwoom-REST-API kiwoom/_data/kiwoom_api_spec.json (commit 79e39336).
