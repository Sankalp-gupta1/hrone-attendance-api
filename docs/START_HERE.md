# Start here: what does this project do?

Imagine an office attendance register. Each employee has a code. Each working day, they record when they arrive and leave. Sometimes a clock is wrong or somebody chooses the wrong status. A manager needs to fix that mistake without hiding what changed.

This project is the software behind that register. It stores employees, records attendance, checks the rules and produces reports. It is an **API**: another program sends a request and receives an answer. The built-in `/docs` page gives you buttons and forms to try it yourself.

## The three main pieces

| Piece | In everyday language | Its job here |
|---|---|---|
| Python | The language used to write the instructions | Calculate times, validate requests and describe queries |
| FastAPI | The reception desk | Receive a request, check its shape and send a response |
| MongoDB | The persistent register | Store records, enforce uniqueness and calculate reports |

A **database** keeps the information after the web server stops. An **index** is like the alphabetical index at the back of a book: it helps MongoDB find the right records without reading every page.

## One ordinary day

1. Create a fictional employee, `EMP7001`, with a 09:30–18:30 shift.
2. Record arrival at 09:40:01. This is just outside the ten-minute grace period, so late minutes are 10.
3. Record departure at 19:00. The API calculates 9.33 working hours and 30 overtime minutes.
4. Correct arrival to 09:28, with the reason “Clock was wrong.” The API recalculates hours to 9.53 and lateness to zero.
5. Open the record again. The correction history shows the old values, the new values, who supplied the correction and why.

The [walkthrough](WALKTHROUGH.md) has the exact requests for this example. It uses made-up people and dates, so you can repeat it without using anyone's personal information.

## The reports answer different questions

| Report | Question it answers |
|---|---|
| Employee monthly | How many working days did this person attend, and how late were they? |
| Department summary | How did each department perform, including people with no attendance records? |
| Late leaderboard | Who accumulated the most late minutes, with fair handling of ties? |
| Department trend | What happened each day, including days with no records? |

Reports use the calculated values saved in each attendance record. They do not quietly reinterpret a past record by calculating its hours again.

## What makes a result trustworthy?

Two people clicking at the same time must not create two attendance entries. MongoDB allows only one record for an employee and attendance date. Corrections update the record and add its history entry together. If another request changed the same record first, the losing request gets a clear conflict response and must read it again.

Automated tests send real requests and check real MongoDB results, including a generated dataset of 100,000 attendance records. The [verification guide](VERIFICATION.md) explains what was checked and what remains unverified.

## What this project does not do

It does not provide payroll, a staff login page, verified manager accounts, holiday calendars or a mobile app. A name in `regularized_by` is the caller's label, not proof of identity. The assignment focuses on attendance rules, database queries and reliability.

Read [the code guide](CODE_GUIDE.md) next if you want to understand how it was built. It explains every included file and gives you a sensible reading order.
