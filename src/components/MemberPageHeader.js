import React from 'react';
import PageHeader from './PageHeader';

export default function MemberPageHeader({
  title,
  subtitle,
  onBack,
  backAccessibilityLabel,
  children,
  footer,
  style,
  panel = false,
}) {
  void panel;
  return <PageHeader title={title} subtitle={subtitle} onBack={onBack} backAccessibilityLabel={backAccessibilityLabel} footer={footer} style={style}>{children}</PageHeader>;
}
