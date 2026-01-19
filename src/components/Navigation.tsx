import { NavLink } from 'react-router-dom';
import styles from './Navigation.module.css';

export function Navigation() {
  return (
    <nav className={styles.nav}>
      <NavLink
        to="/strategy"
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
      >
        STRATEGY
      </NavLink>
      <NavLink
        to="/portfolio"
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
      >
        PORTFOLIO
      </NavLink>
      <NavLink
        to="/dev"
        className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}
      >
        DEV
      </NavLink>
    </nav>
  );
}
