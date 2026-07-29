import pkg from '../../../package.json';

export function Footer(props: { onSettings: () => void }) {
  return (
    <footer className="footer">
      V{pkg.version.replaceAll('.', '·')}
      <button className="settings" onClick={props.onSettings}>
        SETTINGS
      </button>
    </footer>
  );
}
