/**
 * Fixtures for the notification-isolation guard.
 *
 * A structural check parsed positionally against function bodies has the same
 * silent-no-match failure mode as every other parser in this suite: if the
 * matcher stops finding inserts, it reports zero offenders and looks green.
 * These fixtures pin both directions — bodies the guard MUST flag, and bodies
 * it MUST NOT — plus the shapes that break naive parsing.
 */

export interface IsolationFixture {
  name: string;
  /** true when the guard must report the body as an offender. */
  offends: boolean;
  /** Number of notification inserts the parser must locate in the body. */
  inserts: number;
  body: string;
}

export const ISOLATION_FIXTURES: IsolationFixture[] = [
  {
    name: 'bare insert, no block at all',
    offends: true,
    inserts: 1,
    body: `
BEGIN
  INSERT INTO public.notifications (user_id, type, title)
  VALUES (NEW.user_id, 'x', 'y');
  RETURN NEW;
END;`,
  },
  {
    name: 'same insert inside a nested exception block',
    offends: false,
    inserts: 1,
    body: `
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES (NEW.user_id, 'x', 'y');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;`,
  },
  {
    name: 'function-level exception handler protects the whole body',
    offends: false,
    inserts: 1,
    body: `
BEGIN
  INSERT INTO public.notifications (user_id, type, title)
  VALUES (p_user, 'x', 'y');
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;`,
  },
  {
    name: 'insert inside a loop, no handler anywhere',
    offends: true,
    inserts: 1,
    body: `
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles LOOP
    IF r.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title)
      VALUES (r.user_id, 'x', 'y');
    END IF;
  END LOOP;
  RETURN NEW;
END;`,
  },
  {
    name: 'insert inside a loop, nested handler inside the loop',
    offends: false,
    inserts: 1,
    body: `
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, type, title)
      VALUES (r.user_id, 'x', 'y');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN NEW;
END;`,
  },
  {
    name: 'nested plain block WITHOUT a handler does not launder the insert',
    offends: true,
    inserts: 1,
    body: `
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES (p_user, 'x', 'y');
  END;
  RETURN NEW;
END;`,
  },
  {
    name: 'a sibling block with a handler does not cover a later bare insert',
    offends: true,
    inserts: 2,
    body: `
BEGIN
  BEGIN
    INSERT INTO public.notifications (user_id, type, title)
    VALUES (p_a, 'x', 'y');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  INSERT INTO public.notifications (user_id, type, title)
  VALUES (p_b, 'x', 'y');
  RETURN NEW;
END;`,
  },
  {
    name: 'INSERT ... SELECT spanning lines, with a CASE inside',
    offends: true,
    inserts: 1,
    body: `
BEGIN
  INSERT INTO public.notifications
    (user_id, type, title, link)
  SELECT ur.user_id,
         'x',
         'y',
         CASE WHEN ur.role = 'management' THEN '/a' ELSE '/b' END
    FROM public.user_roles ur;
  RETURN NEW;
END;`,
  },
  {
    name: 'the phrase inside a quoted literal is not an insert',
    offends: false,
    inserts: 0,
    body: `
BEGIN
  RAISE NOTICE 'INSERT INTO public.notifications is what failed here';
  PERFORM public.try_notify(p_user, 'x', 'y', NULL);
  RETURN NEW;
END;`,
  },
  {
    name: 'the phrase in a comment is not an insert',
    offends: false,
    inserts: 0,
    body: `
BEGIN
  -- INSERT INTO public.notifications used to live here; now isolated.
  PERFORM public.try_notify(p_user, 'x', 'y', NULL);
  RETURN NEW;
END;`,
  },
  {
    name: 'a CASE ... END must not be mistaken for the block END',
    offends: false,
    inserts: 1,
    body: `
BEGIN
  BEGIN
    v_link := CASE WHEN p_admin THEN '/management' ELSE '/operator' END;
    INSERT INTO public.notifications (user_id, type, title, link)
    VALUES (p_user, 'x', 'y', v_link);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;`,
  },
  {
    name: 'dollar-quoted literal containing END; does not close the block',
    offends: false,
    inserts: 1,
    body: `
BEGIN
  BEGIN
    v_sql := $q$ BEGIN SELECT 1; END; $q$;
    INSERT INTO public.notifications (user_id, type, title)
    VALUES (p_user, 'x', 'y');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;`,
  },
];