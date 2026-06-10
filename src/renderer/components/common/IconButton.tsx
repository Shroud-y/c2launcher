import styles from './IconButton.module.css'

interface IconButtonProps {
  label: string
  onClick?: () => void
  active?: boolean
  danger?: boolean
  children: React.ReactNode
}

export default function IconButton({
  label,
  onClick,
  active = false,
  danger = false,
  children
}: IconButtonProps): JSX.Element {
  const classNames = [styles.button]
  if (active) classNames.push(styles.active)
  if (danger) classNames.push(styles.danger)

  return (
    <button type="button" className={classNames.join(' ')} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  )
}
