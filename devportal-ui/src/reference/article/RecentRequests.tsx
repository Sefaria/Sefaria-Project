// "Recent Requests": this browser's Try It calls for this operation (localStorage, tryit/recent.ts). Live's
// "Log in to see full request history" link is absent (deviation D-6).
import { useSyncExternalStore } from 'react';
import { relativeTime } from '../tryit/recent';
import { useEndpoint } from '../state';
import { StatusDot } from '../ui/primitives';
import styles from './Article.module.css';

// A clock that ticks once a minute, for the relative times. The server snapshot is null, so a prerender shows no
// time and stays deterministic.
const subscribeMinute = (onChange: () => void) => {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
};
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000 + 59_999;
const noTime = () => null;

export function RecentRequests() {
  const { recent, selectedRecent, selectRecent } = useEndpoint();
  const now = useSyncExternalStore(subscribeMinute, minuteNow, noTime);
  return (
    <div className={styles.recentSection} data-visual-region="recentRequests">
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} data-visual="sectionHeader">
          Recent Requests
        </h2>
      </header>
      <div className={styles.logs}>
        <table className={styles.logsTable} data-visual="logsTable">
          <colgroup>
            <col className={styles.colTime} />
            <col className={styles.colStatus} />
            <col />
            <col className={styles.colEnd} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" data-visual="logsTh">
                Time
              </th>
              <th scope="col">Status</th>
              <th scope="col">User Agent</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className={styles.logsEmpty}>Make a request to see history.</div>
                </td>
              </tr>
            ) : (
              recent.map((entry, i) => (
                <tr
                  key={`${entry.time}-${i}`}
                  className={[
                    styles.logRow,
                    entry.status >= 200 && entry.status < 300 ? styles.logRowOk : styles.logRowError,
                    selectedRecent === i ? styles.logRowSelected : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className={styles.logTime} data-visual-mask="recentRequestsTime">
                    <button
                      type="button"
                      className={styles.logSelect}
                      aria-pressed={selectedRecent === i}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectRecent(selectedRecent === i ? null : i);
                      }}
                    >
                      <time dateTime={entry.time}>{now === null ? '' : relativeTime(entry.time, now)}</time>
                    </button>
                  </td>
                  <td>
                    <span className={styles.logStatus}>
                      <StatusDot status={entry.status === 0 ? 'error' : entry.status} />
                      {entry.status === 0 ? 'Error' : entry.status}
                    </span>
                  </td>
                  <td>
                    <span className={styles.logAgent}>Try It!</span>
                  </td>
                  <td />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
