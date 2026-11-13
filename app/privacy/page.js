export const metadata = { title: 'Privacy · Daily League' };

export default function Privacy() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <section className="card prose">
      <h1>Privacy</h1>
      <p className="muted">Last updated 13 November 2026</p>

      <h2>What we keep</h2>
      <ul>
        <li>Your username, display name and email address.</li>
        <li>Your password, stored only in scrambled (hashed) form. Nobody can read it, including us.</li>
        <li>The results you post, including the text you paste, and any screenshots you attach. Screenshots are deleted after 30 days.</li>
        <li>Your friends, leagues, chat messages, reactions, duels and notifications.</li>
        <li>If you switch on notifications, an address your browser gives us for sending them to that device.</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li>Your email address is never shown to other players. It&apos;s used only for password reset links and messages about your account.</li>
        <li>Players in your leagues see the results you post there and your chat messages.</li>
        <li>Your stats page is visible to friends by default. You can make it public or private in your stats page settings.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <p>We don&apos;t sell your information, show ads, or share it with anyone except the services that run the site: hosting, the database, and the email service that delivers reset links.</p>

      <h2>Deleting your account</h2>
      <p>You can delete your account in Settings. That permanently removes your account, results, messages, friendships and screenshots.</p>

      {contact && (
        <>
          <h2>Questions</h2>
          <p>Email <a href={`mailto:${contact}`}>{contact}</a>.</p>
        </>
      )}
    </section>
  );
}
