import pkg from '../../../package.json';

/** Just the version now: the sheet addresses are built in, so there is nothing to set. */
export function Footer() {
  return <footer className="footer">V{pkg.version.replaceAll('.', '·')}</footer>;
}
