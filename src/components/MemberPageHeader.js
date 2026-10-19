import React from 'react';
import PageHeader from './PageHeader';

export default function MemberPageHeader({
  title,
  subtitle,
  eyebrow,
  icon,
  tone,
  onBack,
  backAccessibilityLabel,
  backDisabled,
  children,
  footer,
  style,
  panel = true,
}) {
  void panel;
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      eyebrow="COMMUNITY CONNECT"
      icon={icon}
      tone={tone}
      onBack={onBack}
      backAccessibilityLabel={backAccessibilityLabel}
      backDisabled={backDisabled}
      footer={footer}
      style={style}
    >
      {children}
    </PageHeader>
  );
}
