import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to a `useActionState` action WITHOUT React clearing the fields.
 *
 * `<form action={fn}>` resets every uncontrolled input when the action finishes,
 * so a validation error would wipe everything the person typed. Using this as
 * `onSubmit` keeps their values on screen; they only fix what was wrong.
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
