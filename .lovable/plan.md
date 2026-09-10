# How to open Ali Mohamed's driver view on your phone

Read-only. Nothing was changed. Everything below is from the current source, plus live checks where noted.

## Why you can't find it

It is **not in the Management/Owner portal at all**. The Operator Preview screen is only built into the **Staff portal** (`StaffPortal`); the management portal has no such menu item — verified by searching it. Since you are signed in with Owner as your active role, your dashboard renders the management portal, so the item is simply not on your menu.

You do have access: the `/staff` area admits anyone with management (which includes owner), and you also hold the Onboarding Staff role outright (live check on your account: owner, management, onboarding_staff, dispatcher, operator).

## The directions, in order

1. Switch your active role to **Onboarding Staff** using the role switcher, or type `/staff` at the end of the app address. Either lands you in the Staff portal.
2. In the left menu, look under the **Tools** heading — below Messages, Resource Center, FAQ Manager and Equipment. The item is called **Operator Preview**, with an eye icon. (This is the heading mismatch: "previewing a driver" is filed under Tools, after a run of unrelated admin items.)
3. The page header reads **Operator Preview**, with the line "Select an operator to see their portal exactly as they see it — read-only. Use the phone icon to open a live session on your own device."
4. In the search box ("Search by name or unit number…") type **Ali**. Note there are two Mohameds on the list; the other is Salman Mohamed, who is inactive.
5. On Ali's card, the **phone icon sits at the far right**, separated from the rest of the card. It is a small unlabelled icon-only button, always visible — no hover needed. Hovering shows the tooltip "Open on my phone as this driver". The other icon on the card, an eye at the right edge of the name block, is part of the card's main clickable area and opens the read-only in-app preview instead — the two are close together, which is the second reason this is easy to miss.
6. Clicking the phone icon opens a dialog titled **Open on my phone**, with the line "Scan this code to sign in on your phone as Ali Mohamed. Actions you take are real."

## Will Ali appear?

Yes. The picker applies **no filter at all** — it lists every operator, newest first, and only the search box narrows it. Live check: Ali Mohamed's operator row is active, not a demo account, and holds the `operator` role, which is the one condition the code-issuing function requires. His unit shows as 260 (read from his onboarding record, since the operator record's unit is blank).

## The alternative to scanning

Inside the same dialog, below the QR image, there are two buttons: **Copy link** and **New code**. Copy link puts the sign-in URL on your clipboard and confirms with "Preview link copied". Paste it into a private/incognito window — do not use your normal window, or you will be signed out of your own account in it.

The code is valid for **3 minutes** (a live countdown shows under the QR, e.g. "Expires in 2:41 · single use") and can be used **once**. If it lapses, press New code. Issuing a new code silently cancels any earlier unused one for that driver.

Once redeemed, that browser is genuinely signed in as Ali — so open **My Fuel** and read; don't tap anything that changes data. The session marks itself and signs out after 60 minutes.
