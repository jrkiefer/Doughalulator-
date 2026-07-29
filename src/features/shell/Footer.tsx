import pkg from '../../../package.json';

export function Footer() {
  return (
    <footer className="footer">
      V{pkg.version.replaceAll('.', '·')}
      <button className="settings" disabled>
        SETTINGS — COMING IN A LATER STEP
      </button>
    </footer>
  );
}
