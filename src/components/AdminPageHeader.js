import React from 'react';
import PageHeader from './PageHeader';

export default function AdminPageHeader({ title, subtitle, icon = 'shield-account-outline', tone = 'teal', onBack, children }) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      eyebrow="ADMIN DASHBOARD"
      icon={icon}
      tone={tone}
      onBack={onBack}
      backAccessibilityLabel="Back to admin dashboard"
    >
      {children}
    </PageHeader>
  );
}
