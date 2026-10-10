import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface PortalCardProps {
  to: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: 'blue' | 'violet' | 'orange' | 'green';
  detail?: string;
  featured?: boolean;
  visualSrc?: string;
}

export function PortalCard({
  to,
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = 'blue',
  detail,
  featured = false,
  visualSrc,
}: PortalCardProps) {
  return (
    <Link
      to={to}
      className={`portal-card portal-card-${tone}${featured ? ' portal-card-featured' : ''}${visualSrc ? ' portal-card-with-visual' : ''}`}
    >
      {visualSrc && <img className="portal-card-visual" src={visualSrc} alt="" aria-hidden="true" />}
      <span className="portal-card-icon"><Icon size={22} strokeWidth={1.8} /></span>
      <span className="portal-card-copy">
        <span className="portal-card-eyebrow">{eyebrow}</span>
        <strong className="portal-card-title">{title}</strong>
        <span className="portal-card-description">{description}</span>
      </span>
      <span className="portal-card-foot">
        <span>{detail}</span>
        <span className="portal-card-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
      </span>
    </Link>
  );
}
