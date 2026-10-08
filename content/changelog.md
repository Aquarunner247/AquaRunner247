# What's new

Changes to AquaRunner 24/7, newest first. Written for the people using it rather than for the code —
if something here affects how you or your technicians work, it says so.

<!-- New entries go DIRECTLY BELOW the rule, above the newest dated heading. Appending to the end
     puts them under September, which is where the first three days of October ended up. -->

---

## October 8, 2026

**Plan seats changed, and extra ones are now buyable.** Service includes 3 staff logins and White
Label 5. Past that you're no longer stopped — each additional staff login is $15/month, and the app
asks you to accept the charge before it adds the person. Remove them later and the charge goes with
them. Enterprise stays unlimited.

Customer portal logins have never counted toward either number and still don't — a customer can have
as many people in their portal as they like, on any plan.

AquaRunner Compliance is the exception: it stays a hard 2 seats. At $19/month, a $15 third seat would
be most of another subscription.

**The legal pages and the link previews caught up.** Terms and Privacy were still wearing the old
page shell — and, because they were added to the site after the rule that hides it was written, the
staff sidebar was showing down the left edge of both for anyone signed in. Fixed, and the rule now
reads from one list so a new public page cannot miss it again.

The images that show when a page is shared — in a text message, on Facebook, in Slack — were still
the old teal design and still carried headlines the site no longer uses. All four were redrawn to
match, and a test now fails if the colours ever drift apart again.

**A new look for the public site.** The home, features, pricing, and property-manager pages have been
rebuilt to a single design — one navy, one coral, one set of headline type — instead of four pages
that had quietly drifted apart. Nothing about how the app works changed, and the app's own screens
are untouched for now.

Three claims came off the site while rebuilding it, because the app doesn't do them: route-deviation
alerts, tablet feeder timing in the dosing calculator, and white-labelling "the app" (your branding
reaches the customer portal and the emails, not the technician and office screens). The pages say
what the app actually does instead.

## October 7, 2026

**A daily to-do email.** Each morning you get one email listing everything outstanding, grouped by
customer, with overdue items first and in red. It only arrives when something is actually due — no
"nothing today" mail to train you into ignoring it. It shows exactly what the notification bell shows,
so the two can never disagree.

## October 6, 2026

**New app icon.** The runner mark now appears on the browser tab, as a bookmark or home-screen icon, and
in the corner of every marketing page, in the site's own teal rather than the original black and bright
blue. It was redrawn as vector, so it stays sharp at every size instead of being an enlarged photo of a
small image.

If your tab still shows the old one, browsers hold on to icons hard — a forced refresh or a new tab
sorts it out.

**QR code back on the landing page.** Section 02 — "An inspector walks up" — now shows the pump-room
placard next to the record it opens, instead of the record alone. The section's whole claim is that
pairing, and only half of it was on screen.

**To-dos tell you sooner.** A to-do with no due date now appears in the notification bell straight away
instead of never — if it was worth writing down, it's worth being reminded of. And when you do set a
date you can choose how far ahead to be told: on the day, 1 or 3 days before, or 1 or 2 weeks before.

## October 5, 2026

**A service report can be sent again, to anyone.** Open any visit and look for *Send this report
again*. Type one or more email addresses and it sends that whole service day — every pool and spa on
the walk-up, with readings, chemicals and photos. It goes only to the addresses you type; nobody who
got it the first time receives another copy. Works for any day, however old, and it shows you when the
report first went out and to whom.

**Customers can save the photos from their service email.** Each photo now has a *Save this photo*
link underneath it. Tapping an inline image was never a reliable way to save one — Gmail serves it
through its own proxy, and many phone mail apps offer no way at all — so a customer asked for a photo
and couldn't keep it. The saved file is named after the property, the pool and the date, so photos
from different visits can be told apart.

**Connection monitoring.** The database now records how many connections are in use, once a minute.
This is groundwork, not a feature: it is the early warning for the kind of overload that took the site
down on September 18th.

**To-dos per customer.** On any customer page: what needs doing, an optional due date, and any detail
worth keeping. Anything due today or overdue appears in the notification bell with the customer's name
until it's marked done.

Done is kept rather than deleted, so "did we ever do that for them" stays answerable — with who
finished it and when. Delete is there for the ones typed by mistake. Only your staff see these; the
customer never does.

## October 3, 2026

**Other contacts on a customer.** Regional managers, assistant managers, accounts payable — anyone at
the account who isn't tied to one property. Name, title, email and phone, on the customer page. A
property's own manager and maintenance contacts stay where they are.

For reference only: service summaries and alerts still go to the property contact, so adding someone
here does not start emailing them.

## October 2, 2026

**A maintenance person at your customer can keep the daily log.** Add a portal login and choose
*Maintenance — daily log only*. They get one screen to record the readings their state requires, plus
the safety data sheets for the chemicals used on their property, and nothing else from the portal.

Their readings never overwrite your technician's. The compliance log shows one line per day with the
latest reading on it, and both records are kept underneath. Each card says whether anything has been
logged that day already — including by your own technician — so they can see which days still need
doing.

**Nobody has to invent a password any more.** Adding a portal login asks only for a name and an email.
The customer gets a welcome email with a link to choose their own password. Nothing with a working
password in it reaches an inbox, and there is nothing for your office to pass along.

**Activation links work.** Clicking the link in a welcome email used to land on the staff login with
an error, and the only way in was "forgot my password". Fixed, along with the portal's own forgot-
password link, which was sending customers back to the staff sign-in page afterwards.

**The welcome email no longer promises things the app doesn't do.** It claimed customers could see
billing, request service, and message you through the portal. None of those exist. It now describes
what the portal actually does.

**Unfinished stops stop saying "In progress" forever.** A stop left open is closed out overnight and
reads *Pushed* on the schedule, and it drops off the overdue list in the notification bell. It is not
marked complete — nobody serviced it, and the compliance log keeps saying so. Readings already entered
stay exactly where they are.

**Readings are filed on the day they were taken.** The compliance log used the server's date, not the
pool's, so a reading taken after 5pm landed on the next day — and one taken on the last evening of a
month disappeared from the log entirely.

## October 1, 2026

**A mis-tapped chemical can be removed.** *Add to visit* writes a dose immediately and nothing could
take it back, so an accidental press billed a customer for a chemical that was never poured and
recorded it as added. A technician can remove one while the visit is open; after that an admin or
office user can, any time.

**A dose tapped twice is no longer charged twice.** Four visits had the same pour logged two or three
times. Those were cleaned up — $72.71 of overcharge — and the server now rejects an identical dose
logged within a minute.

**The app never recommends adding chlorine to a pool that already has too much.** A pool reading 12
ppm against its own 10 ppm ceiling was told to add another 1.25 gallons.

**Emails come from your name, not ours.** Customer-facing email now shows your business as the sender
and comes from `service@` rather than `no-reply@`, so a customer who replies reaches a person.

**Backwash time records when it happened**, not when the form was filled in — and a visit no longer
tells a customer their pool was serviced for eight hours because someone closed the paperwork that
evening.

**A photo is asked for firmly but no longer blocks the record.** The photo is for the customer, not
for compliance, so a missing one was keeping readings out of the state log.

## September 30, 2026

**The tour says how to get it back.** Skipping it part-way used to close everything with no word about
*Replay tour* existing.

**Imported logbook readings are no longer treated as performed services.** They count for the
compliance log, which is why they are imported, and nothing else.

**Old visits are never emailed to customers.** A summary more than a week old is not sent — the
customer has long since forgotten the visit.
