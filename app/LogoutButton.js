'use client';

import { useRef } from 'react';
import { logout } from './actions';
import Submit from './Submit';

export default function LogoutButton() {
  const dialog = useRef(null);

  return (
    <>
      <button className="link" type="button" onClick={() => dialog.current.showModal()}>
        Log out
      </button>
      <dialog ref={dialog} className="logout-dialog" aria-labelledby="logout-title">
        <h3 id="logout-title">Log out of Daily League?</h3>
        <form action={logout} className="row">
          <button className="btn" type="button" autoFocus onClick={() => dialog.current.close()}>
            Cancel
          </button>
          <Submit className="btn danger">Confirm log out</Submit>
        </form>
      </dialog>
    </>
  );
}
