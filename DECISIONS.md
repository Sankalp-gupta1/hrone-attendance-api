# Design decisions

1. **Indexes.** Employees have a unique `emp_code` index, a department/code index for filtered lists, and joined-date/department indexes in both orders for headcount queries. Attendance has a unique employee/date index for duplicate protection and monthly lookups, a date/employee index for ordered lists and month scans, a status/date/employee index for status filters, and an employee/punch-time index for the latest punch. I rejected a standalone status index: its five values are not selective enough and it cannot provide the required date order.

2. **Punch-in race.** Both requests can read the employee. Each attempts an insert. MongoDB's unique employee/date index accepts one. The duplicate-key exception becomes 409; the successful insert returns 201. A preliminary existence check is not the guarantee.

3. **Ties.** MongoDB calculates competition ranks before filtering. Everyone with `rank <= limit` is returned, including tied employees at the cutoff. Employee code breaks display-order ties without changing rank.

4. **Headcount.** The department pipeline starts from eligible employees and looks up their attendance. An empty lookup still contributes one employee.

5. **100× more data.** I would add incremental daily department summaries, with corrections updating affected days, then measure query plans before changing indexes.
