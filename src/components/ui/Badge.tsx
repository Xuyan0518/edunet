
import React from 'react';
import { Badge as ShadcnBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BadgeProps {
  text: string;
  variant?: 'default' | 'outline' | 'secondary' | 'destructive';
  size?: 'default' | 'sm';
  className?: string;
  animation?: boolean;
  onClick?: () => void; // Add onClick prop
}

const Badge: React.FC<BadgeProps> = ({ 
  text, 
  variant = 'default', 
  size = 'default',
  className,
  animation = false,
  onClick
}) => {
  return (
    <ShadcnBadge 
      variant={variant} 
      className={cn(
        size === 'sm' && 'text-xs px-2 py-0.5',
        animation && 'animate-pulse-subtle',
        onClick && 'cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      {text}
    </ShadcnBadge>
  );
};

export default Badge;
