# Yes, this is a bug in SUPERDRIVE, and it's confirmed

**What happened (from the records):** On 23 Sep at 12:09 pm Central, Mae's login saved a truck owner for Rovelt Laforet named **Lonnie Johnson**, but with the email **[rlaforet13@gmail.com](mailto:rlaforet13@gmail.com)**. That is Rovelt's own email. The save step looks for an existing login with that email, finds Rovelt's, and then:

1. **renames that login's name to the truck owner's name.** Rovelt's profile now reads "Lonnie Johnson", and the pipeline shows that name.
2. gives Rovelt's own login the truck-owner role.
3. links the truck-owner record to Rovelt's login instead of a separate one for Lonnie.

The history log shows the rename happening at the same moment as the save. His application still says Rovelt Laforet. Only the name on his login changed.

**Part 1: repair Rovelt's record**

- Change his profile name back to Rovelt Laforet.
- Take the truck-owner role off his login and unlink it from the truck-owner record. Lonnie's details (name, address, phone) stay on the card.
- Lonnie gets a login only once you have his own email. Staff then re-save the card with that email.

**Part 2: stop it from happening again**

- **Never rename anyone.** Saving a truck owner will never change the name on an existing login. It only fills in a name for a login it just created.
- **Refuse the driver's own email.** If the email belongs to the driver on this card, or to any other existing driver or staff member, the save stops with a clear message: "This email belongs to Rovelt Laforet. Enter the truck owner's own email."
- **Driver is his own owner:** if the owner really is the driver, the card uses a separate "Driver owns the truck" choice. It never reuses his login under a different name.
- **Check for other drivers with the same problem:** I'll look for any other driver whose login was renamed when a truck owner was saved, and list them for you before fixing anything.
