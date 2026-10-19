# What's new

Changes to AquaRunner 24/7, newest first. Written for the people using it rather than for the code —
if something here affects how you or your technicians work, it says so.

<!-- New entries go DIRECTLY BELOW the rule, above the newest dated heading. Appending to the end
     puts them under September, which is where the first three days of October ended up. -->

---

## October 14, 2026

**Move a stop to another technician or day.** Each stop on a route has a "Move to…" picker, so
changing who services a venue — or which day — no longer means removing it and adding it back. The
venue keeps its place in the system, and the days rebuild themselves on the new route.

**Route placement stays available.** The suggestion panel used to exist for a single page render
right after a customer was added — add the venue afterwards, as the page invites you to, and it
was gone for good. It now shows whenever a venue is on no route at all, and goes away by being
dealt with.

**Stop counts count walk-ups.** A day of eleven venues across nine walk-ups now reads as nine
stops, everywhere it's counted — the schedule headline, the progress bar, the route cards, route
capacity and the week view. The progress bar follows the same unit: a walk-up counts as done once
every venue in it is, so it no longer jumps forward when only the pool of a pool-and-spa pair is
finished.

Two counts deliberately still count venues. Pay is earned per visit — two bodies is two sets of
readings whether or not they share a gate — and an overdue stop needs attention on its own rather
than being folded into a sibling that happens to be done.

**You decide which venues are one stop, not the app.** A venue now has a "Serviced together as"
field. Give two venues the same name there and they're one stop on the schedule and one card on
the route — each still keeping its own readings, photos and completion. Leave it blank and the
venue is its own stop.

This replaces the app guessing from how close the pins were and whether the venues were a pool and
a spa. That guess read your properties almost perfectly, but it decided something you could see by
means you couldn't: nudging a pin could split a card with nothing to show for it, and OYO's two
pools — one arrival, 16 m apart — could never be one stop because both are pools. Now they can, if
you say so.

The routes page shows walk-ups as one card too, which it never did before.

**A bundled walk-up drags as one.** A property's pool and spa are one arrival, so the card has its
own grip that moves every stop in it together. Each body keeps its own grip for deliberately
pulling one out of the bundle.

**Skipped stops drop out of the day's directions.** The map no longer routes through a stop that
was skipped — the line joins its neighbours directly, and the numbering closes up so the order
reads 1, 2, 3 over the stops actually being serviced. The skipped stop still shows on the map with
its ×, so it's clear why the route passes it by.

**A route can start or finish AT a stop, not just near one.** Setting a day's finish to a customer
now means that customer is serviced last. Before, the finish was a bare coordinate the optimizer
added as an extra point, so a property set as the finish existed twice — once as the real stop and
once as a phantom beside it. On Rich's Friday that put both OYO pools second and ended the day at
Paseo Del Prado, 19 km from the finish that had been set.

The start/end screens now let you choose one of that day's stops directly, which is more exact than
dropping a pin: a pool's own location sits a few hundred metres from its property's street address
across this data, and picking the stop uses the pool. Setting a home or the yard still works the
way it did — the day finishes by driving there after the last stop.

**One-off stops can be added from the route planner.** Each route now has "Add a one-off stop to
a Friday" under its stop list. It lands on one date only and never joins the weekly route, so a
pool-store run doesn't repeat every week. The date defaults to the next time that route runs
(today, when today is that day) and the technician comes from the route.

**One place decides stop order: the route.** The schedule's own "Optimize stop order" is gone —
reorder a route in Routes and every future day of it follows automatically, and drag is there for
a one-off change on the day. Before this, the two optimized separately and disagreed, because a
day's schedule often isn't the same set of stops as the route (a Friday carrying an extra property
is a different problem to solve than the route is).

Days with extra work on them come along too. The whole day gets rebuilt rather than just the
route's share of it, so nothing ends up sharing a position, and an extra stop stays with whichever
route stop it currently sits behind. Anything already arrived at, finished, skipped or moved keeps
its place — a stop serviced first thing doesn't get shuffled into the afternoon.

**The technician's schedule is a list with directions on it, not a map.** The day tab no longer
draws the route map — the techs' verdict was that it did nothing for them and it pushed the list
they actually use below the fold. The map is still there on its own tab, and its pins are now
openable: tap one and you get the stop with **Open stop** and **Directions** on it. The day tab
instead leads with the next stop still to do and a Directions button for it, so getting to the
next address is one tap from the top of the screen rather than something you find by finishing a
stop first.

**Moving a stop to tomorrow is admin-only now.** It's an office call about the day's plan, and on
a phone it sat one tap from Skip.

**The "Directions to next stop" bar actually appears now.** It has been shipping since
September but no technician could have seen it: the bottom tab bar is pinned to the same edge and
sits above it, covering 59 of its 77 pixels on a phone. A tap aimed at Directions hit a nav tab
instead. It only ever looked right on a desktop browser, where that tab bar is hidden. The bar now
sits on top of the nav rather than under it.

**The technician can see what the pool last read.** Every visit screen now shows the last
recorded reading for that body of water, and when it was — "Yesterday", "3 weeks ago", with the
date and the time it was taken. Commercial gets it on both Chemistry and Gauges, so filter
pressure can be read against last visit's.

It counts imported logbook rows and readings a property logged itself, and says so, because those
weren't taken with your test kit. It skips blank visits and visits where the only thing written
down was a field that screen doesn't show — on Cornerstone's Office Pool that's the difference
between showing nothing and showing the pH 7.4 / FC 3.0 from the day before.

**Residential visits have a checklist.** They had none at all — the screen was built to skip it. It's
a separate list from the commercial one, in the three groups you work to: Daily & As-Needed, Weekly
Maintenance, Monthly & Seasonal. Your commercial checklist is untouched.

Two things an admin can set per item. **Required** blocks closing the stop until it's ticked, the
same way a missing reading does. **Chargeable** marks the work you bill extra for — shock treatment,
filter deep clean, calcium hardness, stabiliser, salt cell, O-rings — and the technician sees the
price on the button as they tap it. What it was priced at gets recorded on that visit, so changing
the price later never rewrites what an old visit charged.

**The gate code reaches the technician.** On a residential visit, *Getting in* now sits at the top of
the screen with the access notes — gate code, where to park, the dog — and the owner's mobile as a
number you can tap to call.

It was already being stored; it just only ever appeared on the customer page in the office, which a
technician can't open. So the one person who needs the gate code was the one person who couldn't
see it.

---

## October 13, 2026

**Stops nobody ever started stop nagging forever.** A stop left untouched on a past day stayed
"overdue" indefinitely — nothing ever closed it, so 109 had built up, the oldest from August. The
nightly sweep now closes those out the same way it already closed out stops that were started and
left open: they read *Pushed*, and they drop off the overdue list.

Nothing is marked complete and no reading is touched. *Pushed* says only what's true — that day
came and went and the stop wasn't done.

**A customer's route schedule shows every day, not one.** The Route schedule list on a customer
page kept only the last route it read, so a pool serviced four days a week showed one of them.
Tailgate Beach Club is on five days and showed Sunday.

It now reads *Mon, Wed, Fri, Sat · Rodrigo Acevedo*, and groups the days by technician when more
than one covers the property — *Mon, Thu, Fri, Sat (Rich) · Sun (Steve)*.

---

## October 13, 2026

**A stop can be moved to the next working day.** Locked gate, dog in the yard, ran out of daylight —
on the schedule, each stop now has *Tomorrow* next to *Skip*. Skipping says the visit isn't
happening; this says it's happening later, and until now there was no way to say that.

It uses the days that technician actually works, from their own routes. A Saturday stop moves to
Monday for someone who doesn't work Sundays, and to Sunday for someone who does. It tells you the
date it landed on, because "tomorrow" isn't always tomorrow.

A property with several pools has one *Tomorrow* on the card, which moves all of them — a gate
nobody can open means the whole walk-up moves, and tapping four of them one at a time is how three
get moved and the fourth forgotten. Anything already finished or already skipped stays put.

Moving asks first, since *Tomorrow* sits next to *Skip* and there's no one-tap way back. *Skip*
doesn't ask, because its button turns into *Unskip* in the same place.

A moved stop stays on the day it came from, shaded and marked *Moved* — so the day still shows it
was scheduled and not done, and so you can see it went somewhere rather than wondering if you
imagined it.

It won't move a stop that already has readings, chemicals or photos on it. Those belong to today,
and carrying them onto tomorrow's visit would file them under tomorrow in the compliance log —
finish that one instead, or skip it.

A moved stop doesn't take tomorrow's regular visit with it. If the property is also due tomorrow,
you'll see both.

---

## October 12, 2026

**Service reports say how long the visit took again.** When a stop is closed out hours later — a
batch of paperwork at the end of a route — arrival-to-completion was never the real time on site, so
the report simply left it out. It now falls back to the last photo, which carries the time it was
actually taken, and says *at least 54m on site* rather than claiming a figure it can't stand behind.

Where a stop is closed out at the stop, nothing changes: the report says *54m on site* as before.

**Chemicals can be added to a visit that's already closed.** If a pour happened but never got typed
in, open the visit and add it — the dose list works on a completed visit for admin and office users,
the same as removing a wrong one already did. Technicians still log chemicals while the stop is open
and nothing changes for them.

The record and the customer's portal both correct themselves. The report they were emailed went out
without it, so if they need the corrected copy, *Send this report again* further down the page does
that. The charge uses the chemical's price today, since that's the only price we hold.

---

## October 11, 2026

**Picking up an unfinished stop starts it properly.** A stop left over from another day used to
keep saying *Pushed* on the schedule even while a technician was standing at it working. Open one now
and it says *Pick this stop back up* — tap *I've arrived* and it reads In Progress like any other
stop.

It also straightens out the arrival time. A picked-up stop kept the arrival time from the day it was
abandoned, so the record showed visits spanning 18 or 20 hours. Customers were never told that — the
report already withholds "time on site" when a visit is closed out long after the work — but the
times on the report read oddly across two days, and the record itself was wrong. The clock now
starts when the work actually restarts.

**A stop starts when you say you've arrived.** Open a stop and the first thing on screen is *Start
this stop*. Readings, chemicals and photos stay locked until you tap *I've arrived* — one tap, and
the arrival time is recorded.

This is because arrival was only logging itself automatically while the schedule screen was open, in
front, on today's date. Any stop worked from the visit screen — or from yesterday's schedule while
catching up — recorded no arrival at all, which was about one stop in six. Those stops also slipped
past the "finish one property before starting another" rule, because that rule watches arrivals.

No signal doesn't stop you. If the tap can't reach us the stop still opens and the arrival records
itself once you're back online.

**A wrong photo can be deleted.** Tap the × on any photo on the visit screen. A technician can
remove one while the stop is still open — the case this is for, catching your own mistake on site —
and after that the office can, any time, the same rule chemicals already follow.

It asks first, because unlike a chemical a photo can't be re-taken once you've driven away. If the
visit is already completed it also says plainly that the customer's report went out with that photo
attached, so deleting it here doesn't unsend the email.

**Extra stops are readable again.** An errand on the schedule — a supply run, a repair — was cut off
after a few words, so a completed one was impossible to identify. Its description is the only record
of what the stop was, unlike a pool visit that has a page behind it, so it now wraps in full and the
Done and Delete buttons move below it on a phone instead of squeezing it.

---

## October 9, 2026

**One property at a time.** A technician can't start a stop at a new property while one at a
different property is still open. Tapping *I've arrived* — or driving into the next property's
geofence — tells them which stop to go back and finish first. Several pools and spas at the *same*
property still open together, exactly as before; that's a single walk-up, not two stops.

If a property genuinely can't be serviced, skip it from the schedule and the route moves on. Stops
left open from a previous day never block the next day's work.

**Chemicals have to be answered for.** A visit can't be completed until either the chemicals used
are logged, or the technician ticks *I did not add chemicals at today's service call*. An empty dose
list used to read the same whether nothing was needed or something was poured and never written
down — which is a bad place to be if a customer ever asks.

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
