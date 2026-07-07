import styles from './Footer.module.scss';

interface FooterProps {
  className?: string;
}

export default function Footer({ className = '' }: FooterProps) {
  return (
    <footer className={`${styles.footer} ${className}`} id="app-footer">
      <p className={styles.copyright}>
        Copyright &copy; PtexSolutions 2026. All rights reserved.
      </p>
    </footer>
  );
}
