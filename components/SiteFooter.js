import styles from './SiteFooter.module.css';

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.socialRow} aria-label="Genesis of Manchester social media">
        <a
          className={styles.socialBadge}
          href="https://www.instagram.com/genesisofmanchester/"
          target="_blank"
          rel="noreferrer"
          aria-label="Follow Genesis of Manchester on Instagram"
        >
          <span className={styles.iconWrap} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M7.8 2h8.4A5.81 5.81 0 0 1 22 7.8v8.4a5.81 5.81 0 0 1-5.8 5.8H7.8A5.81 5.81 0 0 1 2 16.2V7.8A5.81 5.81 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.15 1.5a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
            </svg>
          </span>
          <span className={styles.copy}>
            <small>Instagram</small>
            <strong>@genesisofmanchester</strong>
          </span>
        </a>

        <a
          className={styles.socialBadge}
          href="https://www.facebook.com/genesisofmanchester/"
          target="_blank"
          rel="noreferrer"
          aria-label="Follow Genesis of Manchester on Facebook"
        >
          <span className={`${styles.iconWrap} ${styles.facebookIcon}`} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M13.65 21v-8.21h2.76l.41-3.2h-3.17V7.55c0-.93.26-1.56 1.59-1.56h1.69V3.13c-.29-.04-1.3-.13-2.47-.13-2.45 0-4.13 1.49-4.13 4.24v2.35H7.56v3.2h2.77V21h3.32Z" />
            </svg>
          </span>
          <span className={styles.copy}>
            <small>Facebook</small>
            <strong>Genesis of Manchester</strong>
          </span>
        </a>
      </div>
    </footer>
  );
}
