# Blue Grace parse refinements (4 items)

## Answer to your question on item 1

There is no broker analogue of `FacilityDialog`. `BrokerSelect` has its own small inline add-broker dialog (three fields: company name, MC number, contact name) built directly inside the component, and the parse panel has no dialog at all — it inserts the broker on one click.

So: extract that inline dialog into a shared `BrokerDialog` component, widen it to the five parsed fields, and use it from both places. That reuses the existing pattern rather than adding a second one, and the manual "add broker" path gains the contact phone/email fields at the same time.

## 1. Editable broker before creation

- New `src/components/dispatch/loadForm/BrokerDialog.tsx`: controlled dialog with company name (required), MC number, contact name, contact phone, contact email; inserts into `brokers`, invalidates `load-form-brokers`, returns the new id to the caller. Phone normalized/masked the way other phone inputs are.
- `BrokerSelect` drops its inline dialog and renders `BrokerDialog` instead (same "Add broker" entry point, same behavior).
- `RateConfirmationParser`: "Create new broker from document" no longer writes. It opens `BrokerDialog` pre-filled from the parsed values, and the record is only created on explicit confirm in the dialog. On success the broker is selected on the form exactly as today.
- The pre-filled company name runs through `normalizeImportedName` from `src/lib/textNormalize.ts`, so an all-caps name arrives title-cased and stays editable.

## 2. Dollar sign on monetary inputs

Add a small `CurrencyInput` wrapper (an `Input` with a `$` prefix rendered inside the field, muted, non-interactive) and use it for: linehaul rate, rate per mile, rate per ton, FSC amount, loadout relocation fee, permit cost, stop-off charge amount, and the charge amount fields. Value handling, validation, and submitted payload are unchanged — the prefix is decoration only. Stop-off label drops its now-redundant "($)".

## 3. Street type periods

In `toTitleCase`, street-type tokens are title-cased *and* the trailing period is dropped: `Dr.` becomes `Dr`, `St.` becomes `St`, across the existing street-type list. Directional and acronym handling unchanged.

Note: this reverses a previously specified behavior — the current test asserts `500 W SEVENTH ST.` keeps its period. That assertion will be updated to expect `500 W Seventh St`, because consistency across stops on one load matters more than mirroring how a broker printed it.

## 4. Internal capitals

Add to `toTitleCase` word handling, after the directional/street-type checks:

**General rules — `Mc` and `O'` only.** A word beginning `Mc` followed by a letter capitalizes that letter (`mccree` to `McCree`); same for `O'` (`o'brien` to `O'Brien`). Only a very small exception list here (e.g. `mcguffey`-type entries if one ever surfaces; none needed today).

**Inclusion list — `Mac`, `De`, `La`, `Van`.** No general rule. These split only when the whole word matches an explicit list of genuine compound names: `macarthur`, `macdonald`, `mackenzie`, `macmillan`, `desoto`, `dekalb`, `dewitt`, `lasalle`, `lagrange`, `laporte`, `lacrosse`, `vanburen`, `vanderbilt`, `vanhorn`, `vannuys`. Anything not listed is an ordinary word and stays flat, so `Macon`, `Madison`, `Macomb`, `Delaware`, `Delano`, `Lancaster`, `Lafayette`, `Lawrence`, `Vandalia` all render normally. Bias is deliberately toward under-correcting: a missed `Desoto` is cosmetic, a wrong `MacOn` looks broken.

**All-caps input.** `MCCREE` renders as `McCree`. The word is longer than the three-character acronym-preservation window, so the acronym rule does not catch it; the word is lowercased first and then the `Mc` rule applies. Same for `O'BRIEN` to `O'Brien`. An all-caps word on the `Mac`/`De`/`La`/`Van` inclusion list also splits correctly (`MACARTHUR` to `MacArthur`).

Hyphen handling untouched, so `Winston-Salem` still works.

## Tests

`src/lib/__tests__/textNormalize.test.ts`:
- Street types: period stripped (`ST.` to `St`, `RD.` to `Rd`), existing no-period cases still pass.
- Positive: McCree, McDonald, MacArthur, O'Brien, DeSoto, LaSalle, plus all-caps `MCCREE` to `McCree`.
- Negative: Delaware, Lancaster, Macon (must not become MacOn), Madison, Vandalia, Lafayette.
- Existing acronym/directional cases re-run unchanged.

Full suite run at the end.
