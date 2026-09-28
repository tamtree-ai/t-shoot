# Stick-script writer evaluation — writer-contract

Catalog `c1-5427696dced2bde8`. 2026-09-27T13:00:22.249Z.
Usable means the reply parsed, the check had no errors, and the scene plan held. The stick-script flow asks once more when a reply cannot be used, so this score is after that repair.

| | n | parsed | check passed | plan kept | usable | cost |
|---|---:|---:|---:|---:|---:|---:|
| Drafts | 20 | 17 | 17 | 17 | 17 | $0.0912 |
| Changes | 10 | 10 | 10 | 10 | 10 | $0.0192 |
| Total | 30 | | | | 27 | $0.1104 |

| id | asked | status | parsed | check | plan | scenes | ms | cost | note |
|---|---|---|---|---|---|---:|---:|---:|---|
| d01 | 1 scene | completed | yes | yes | yes | 1 | 16979 | $0.0018 |  |
| d02 | 1 scene | completed | yes | yes | yes | 1 | 16362 | $0.0013 |  |
| d03 | 1 scene | completed | yes | yes | yes | 1 | 17288 | $0.0023 |  |
| d04 | 1 scene | completed | yes | yes | yes | 1 | 14415 | $0.0023 |  |
| d05 | 1 scene | completed | yes | yes | yes | 1 | 23090 | $0.0021 |  |
| d06 | 2 scenes | completed | yes | yes | yes | 2 | 17324 | $0.0023 |  |
| d07 | 2 scenes | completed | yes | yes | yes | 2 | 13177 | $0.0017 |  |
| d08 | 2 scenes | completed | yes | yes | yes | 2 | 23626 | $0.0027 |  |
| d09 | 2 scenes | failed | no |  |  |  | 71225 | $0.0077 | The render service returned no lines to voice — the skit has no spoken beats. |
| d10 | 2 scenes | completed | yes | yes | yes | 2 | 32704 | $0.0045 |  |
| d11 | 3 scenes | completed | yes | yes | yes | 3 | 12953 | $0.0016 |  |
| d12 | 3 scenes | completed | yes | yes | yes | 3 | 69172 | $0.0081 |  |
| d13 | 3 scenes | failed | no |  |  |  | 142208 | $0.0133 | The render service refused the validate request: invalid-reply — the reply could not be used. - scenes: the reply has no lines (expected 11 to 13 lines) |
| d14 | 3 scenes | completed | yes | yes | yes | 3 | 55295 | $0.0049 |  |
| d15 | 3 scenes | completed | yes | yes | yes | 3 | 20756 | $0.0026 |  |
| d16 | 4 scenes | completed | yes | yes | yes | 4 | 17062 | $0.0029 |  |
| d17 | 4 scenes | completed | yes | yes | yes | 4 | 22109 | $0.0028 |  |
| d18 | 4 scenes | failed | no |  |  |  | 132063 | $0.0144 | The render service refused the validate request: invalid-reply — the reply could not be used. - scenes[1].beats[0].actions[1].at: ms -150 is outside the beat (expected 0 … 2625) - scenes[2].beats[0].actions[1].at: ms -150 is outside the beat (expected 0 … 1875) - scenes[3].beats[0].actions[1].at: ms -150 is outside the beat (expected 0 … 2250) |
| d19 | 4 scenes | completed | yes | yes | yes | 4 | 84378 | $0.0094 |  |
| d20 | 4 scenes | completed | yes | yes | yes | 4 | 21211 | $0.0025 |  |
| c01 | Make June meaner | completed | yes | yes | yes | 1 | 15599 | $0.0020 |  |
| c02 | Land the punchline sooner | completed | yes | yes | yes | 1 | 35249 | $0.0037 |  |
| c03 | Cut one line | completed | yes | yes | yes | 1 | 11750 | $0.0012 |  |
| c04 | Give Milo the last word | completed | yes | yes | yes | 1 | 15675 | $0.0012 |  |
| c05 | Make it shorter | completed | yes | yes | yes | 1 | 16303 | $0.0013 |  |
| c06 | Swap who sets up the joke | completed | yes | yes | yes | 1 | 8897 | $0.0010 |  |
| c07 | Make the middle line quieter | completed | yes | yes | yes | 1 | 5425 | $0.0006 |  |
| c08 | Keep the staging and change only the words | completed | yes | yes | yes | 1 | 42242 | $0.0045 |  |
| c09 | End on the receipt, not the apology | completed | yes | yes | yes | 1 | 44202 | $0.0031 |  |
| c10 | Do not add a character | completed | yes | yes | yes | 1 | 9043 | $0.0006 |  |
