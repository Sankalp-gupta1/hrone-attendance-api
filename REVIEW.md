# Review of the starter

These findings refer to the original starter's function names. The fixes are in `app/main.py`; tests exercise both individual rules and real MongoDB behaviour.

| # | Where | What was wrong | A concrete way to notice it | What changed |
|---|---|---|---|---|
| 1 | `health` | Always returned success without contacting MongoDB. | Stop MongoDB: the old endpoint still returned 200. | Ping the database; return 503 when unavailable. |
| 2 | Database setup | No indexes were created. | Duplicate identities were possible; large queries had no supporting index. | Create eight named indexes at startup, including two unique indexes. |
| 3 | `create_employee` | Check-then-insert was vulnerable to a race. | Send eight creates for the same code together. | Let the unique index decide; translate duplicate-key errors to 409. |
| 4 | `EmployeeIn` | Employee-code shape was unchecked. | Send `emp_code: "x"`. | Require `EMP` followed by 4–6 digits. |
| 5 | `EmployeeIn` | Name, department and email constraints were missing. | Empty name, invalid email, or a department longer than 50 characters. | Apply the contract's length limits and email pattern. |
| 6 | `EmployeeIn` | Shift times and equal shift boundaries were unchecked. | Send `24:00`, `9:30`, or identical start/end times. | Validate HH:MM and reject equal boundaries. |
| 7 | `EmployeeIn` | `joined_on` accepted impossible dates. | Send `2026-02-30`. | Check both exact formatting and the real calendar date. |
| 8 | `create_employee` | Creation time used a naive local datetime and was returned as a datetime. | The response contains a date string instead of epoch milliseconds. | Use aware UTC, whole seconds, and an explicit response conversion. |
| 9 | `list_employees` | The skip calculation was one page too far ahead. | Page 1 skipped the first 20 employees. | Use `(page - 1) * page_size`. |
| 10 | `list_employees` | Total ignored the department filter. | A department with two employees reports the whole company's total. | Use the same filter for the page and count. |
| 11 | `list_employees` | Results had no required order. | Insert codes in reverse order. | Sort by employee code in MongoDB. |
| 12 | Both list routes | Invalid page numbers and oversized pages were accepted. | Send page 0 or page size 101. | Enforce page ≥ 1 and page size 1–100. |
| 13 | `punch_in` | An unknown employee was dereferenced. | Punch in with an unknown code: `emp["shift_start"]` fails. | Return 404 before calculating anything. |
| 14 | `PunchInIn` | Timestamp validation accepted wrong types or units. | Send seconds, a numeric string, a float, a boolean or explicit null. | Strict bounded integer milliseconds; omission alone means now. |
| 15 | `PunchInIn` | Any status string was accepted. | Send `ABSENT` to punch-in. | Allow only PRESENT, WFH and ON_DUTY there. |
| 16 | `punch_in` | Date calculation used server-local time. | A punch just after IST midnight still belongs to the previous UTC date. | Convert to IST before choosing the attendance day. |
| 17 | `punch_in` / time helpers | Overnight shifts were treated like ordinary calendar days. | A 01:10 punch for a 22:00–06:00 shift belongs to the previous attendance day. | Resolve the overnight attendance date and next-day shift end. |
| 18 | Time helpers | Subsecond values were not consistently truncated before calculation. | `09:40:00.999` must still be inside grace. | Truncate input instants to whole seconds before storing or calculating. |
| 19 | `compute_late_minutes` | Floored minutes were compared with the grace threshold. | `09:40:01` became minute 10 and incorrectly counted as on time. | Compare seconds with 600 first, then floor the minutes. |
| 20 | `compute_work_hours` | Built-in float rounding did not guarantee decimal half-up. | 4 h 27 m 54 s is 4.465 hours: `round(4.465, 2)` gives 4.46, but the contract requires 4.47. | Calculate with Decimal and ROUND_HALF_UP; the rounded result determines half-day status. |
| 21 | `compute_overtime` | Counted overtime below the 30-minute minimum. | Finishing 29 m 59 s late should give 0 overtime. | Apply the minimum after flooring elapsed minutes. |
| 22 | `compute_overtime` | Always put shift end on the attendance calendar day. | A 06:40 finish after a night shift should yield 40 minutes, not a whole extra day. | Build start and end together, adding one day for an overnight shift. |
| 23 | `punch_in` | Duplicate checks were not race-safe. | Twelve identical punches could all pass the pre-check. | Unique `(emp_code, date)` index and duplicate-key handling. |
| 24 | Attendance responses | Added a MongoDB-derived `id` and returned datetimes directly. | Responses expose `id` and ISO strings instead of the required natural key and integer instants. | Return only contract fields; recursively convert history dates too. |
| 25 | `list_attendance` | Loaded and sorted every matching document in Python. | Memory grows with the collection even for a 20-row page. | Database filter, sort, skip, limit and filtered count, with matching index hints. |
| 26 | `list_attendance` | Date sorting had no employee-code tie breaker. | Two employees on the same day have unstable ordering. | Sort by date descending, then code ascending. |
| 27 | `list_attendance` | Date ranges and status filters were not validated. | Impossible dates or `date_from > date_to` were accepted. | Validate calendar dates, range order and the status enum. |
| 28 | Attendance output | Legacy missing fields were not filled in. | An older row has no `history` or `half_day`. | Supply the documented empty-history/false defaults at the API boundary. |

## Things examined that were already reasonable

- **Customer-generated employee codes:** using `emp_code` as the business identity is correct. There is no reason to make callers learn MongoDB IDs.
- **Two collections:** keeping employees separate from attendance is suitable. Department information belongs to the employee and is joined in reports.
- **`load_dotenv()` precedence:** its default already preserves real environment variables. The final code makes `override=False` explicit; this is clarification, not a claimed starter defect.
- **Synchronous PyMongo with `def` routes:** FastAPI runs these routes in its thread pool. Converting everything to `async def` while keeping blocking database calls would make concurrency worse.
- **String dates:** validated YYYY-MM-DD strings sort correctly and preserve a calendar date without pretending it is an instant.
- **No history for punches:** punches are original events. Only manual corrections append audit entries.

The initially missing routes were implemented separately: punch-out, regularization, four reports and explain. Their absence was marked as TODO work in the kit, so it is not counted as an unexpected review defect.
