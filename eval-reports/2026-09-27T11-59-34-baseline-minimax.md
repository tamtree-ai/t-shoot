# Stick-script writer evaluation — baseline-minimax

Catalog `c1-5427696dced2bde8`. 2026-09-27T11:59:34.867Z.
This scores today's writer. Multi-scene briefs are in the set on purpose: until writer-contract batch 3, a live draft ignores `scenes` and comes back as one scene, so those rows fail "plan" and that is the baseline.

Usable means the reply parsed, the check had no errors, and the scene plan held. The batch-4 gate is 90% usable after the one repair pass. That pass is not in this writer yet.

| | n | parsed | check passed | plan kept | usable | cost |
|---|---:|---:|---:|---:|---:|---:|
| Drafts | 20 | 17 | 17 | 5 | 5 | $0.0074 |
| Changes | 10 | 9 | 9 | 9 | 9 | $0.0031 |
| Total | 30 | | | | 14 | $0.0105 |

| id | asked | status | parsed | check | plan | scenes | ms | cost | note |
|---|---|---|---|---|---|---:|---:|---:|---|
| d01 | 1 scene | completed | yes | yes | yes | 1 | 5986 | $0.0003 |  |
| d02 | 1 scene | completed | yes | yes | yes | 1 | 3766 | $0.0003 |  |
| d03 | 1 scene | completed | yes | yes | yes | 1 | 6466 | $0.0004 |  |
| d04 | 1 scene | completed | yes | yes | yes | 1 | 7709 | $0.0005 |  |
| d05 | 1 scene | completed | yes | yes | yes | 1 | 4327 | $0.0003 |  |
| d06 | 2 scenes | completed | yes | yes | no | 1 | 6700 | $0.0005 |  |
| d07 | 2 scenes | failed | no |  |  |  | 3604 | $0.0002 | The render service refused the validate request: invalid-skit — the skit or premise has errors. - template: Invalid option: expected one of "exchange"/"interview"/"me-vs-me"/"pov-monologue"/"text-slam" (expected one of "exchange" / "interview" / "me-vs-me" / "pov-monologue" / "text-slam") |
| d08 | 2 scenes | completed | yes | yes | no | 1 | 3423 | $0.0002 |  |
| d09 | 2 scenes | failed | no |  |  |  | 5992 | $0.0004 | The render service refused the validate request: invalid-skit — the skit or premise has errors. - lines[4].text: slam text is at most 40 characters (expected a word or a short phrase) |
| d10 | 2 scenes | completed | yes | yes | no | 1 | 6271 | $0.0004 |  |
| d11 | 3 scenes | completed | yes | yes | no | 1 | 6212 | $0.0004 |  |
| d12 | 3 scenes | completed | yes | yes | no | 1 | 6543 | $0.0004 |  |
| d13 | 3 scenes | completed | yes | yes | no | 1 | 6671 | $0.0005 |  |
| d14 | 3 scenes | completed | yes | yes | no | 1 | 3763 | $0.0003 |  |
| d15 | 3 scenes | completed | yes | yes | no | 1 | 5651 | $0.0004 |  |
| d16 | 4 scenes | completed | yes | yes | no | 1 | 4762 | $0.0003 |  |
| d17 | 4 scenes | failed | no |  |  |  | 4551 | $0.0003 | The render service refused the validate request: invalid-skit — the skit or premise has errors. - cast: me-vs-me: give both a "label" so viewers can tell them apart |
| d18 | 4 scenes | completed | yes | yes | no | 1 | 6233 | $0.0004 |  |
| d19 | 4 scenes | completed | yes | yes | no | 1 | 4888 | $0.0004 |  |
| d20 | 4 scenes | completed | yes | yes | no | 1 | 6613 | $0.0004 |  |
| c01 | Make June meaner | completed | yes | yes | yes | 1 | 5253 | $0.0003 |  |
| c02 | Land the punchline sooner | completed | yes | yes | yes | 1 | 4604 | $0.0003 |  |
| c03 | Cut one line | completed | yes | yes | yes | 1 | 5051 | $0.0003 |  |
| c04 | Give Milo the last word | completed | yes | yes | yes | 1 | 5308 | $0.0004 |  |
| c05 | Make it shorter | completed | yes | yes | yes | 1 | 4574 | $0.0002 |  |
| c06 | Swap who sets up the joke | completed | yes | yes | yes | 1 | 5380 | $0.0003 |  |
| c07 | Make the middle line quieter | completed | yes | yes | yes | 1 | 5308 | $0.0003 |  |
| c08 | Keep the staging and change only the words | completed | yes | yes | yes | 1 | 4559 | $0.0003 |  |
| c09 | End on the receipt, not the apology | failed | no |  |  |  | 4771 | $0.0003 | The render service refused the validate request: invalid-skit — the skit or premise has errors. - beats[3].text[0].at: word "receipt" is not in the line (expected one of the line's words: it, says, you're, fired) |
| c10 | Do not add a character | completed | yes | yes | yes | 1 | 5936 | $0.0003 |  |
