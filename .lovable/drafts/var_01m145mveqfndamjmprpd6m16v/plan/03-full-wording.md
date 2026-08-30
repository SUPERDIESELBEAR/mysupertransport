# Printing every bit of the wording

The printed application is rebuilt from summary rows into a full document. Each section prints the question exactly as the applicant saw it, followed by their answer.

| Today prints | Will print |
|---|---|
| `Safety history: Yes` | The full "I have read the above Disclosure Regarding Background Reports and I hereby authorize…" paragraph, then **Authorized — Yes** |
| `Testing policy: Yes` | The full Certificate of Receipt acknowledgment sentence, then **Accepted — Yes** |
| `In SAP process: No` | The full 49 CFR 40.25(j) question text, with the notice paragraph above it, then **No** |
| `Held CDL 10+ years: Yes` | The FMCSA 10-year employment-history question as worded on the form, then **Yes** |
| Employment rows | Same rows, plus the section's instruction text (10-year requirement, gap explanation prompt) |

Also included so nothing is missing on paper:

- The section intros and legal notices from each step (FCRA, PSP, 49 CFR 40.25(j), 382.601).
- Every employer record in full, in order, including reason for leaving and gap explanations.
- The applicant's signature image, typed name, signed date, submitted timestamp, and whether it was self-submitted or staff-assisted.
- Answers left blank print as an explicit "Not provided" rather than an em dash, so a blank is visibly a blank and not a rendering slip.
- Document uploads print as a named line ("Driver's License — Front: on file") instead of a View button, since a button means nothing on paper.

To keep the wording from drifting between screen and paper, the question text moves into one shared copy file that both the form steps and the printed document read. Changing a question then changes it in both places at once.
