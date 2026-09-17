import React from 'react';
import PageHeader from './PageHeader';

export default function AdminPageHeader({ title, subtitle, onBack, children }) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      eyebrow="ADMIN DASHBOARD"
      onBack={onBack}
      backAccessibilityLabel="Back to admin dashboard"
    >
      {children}
    </PageHeader>
  );
}
