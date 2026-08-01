import React from 'react';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';

const STATUS_CONFIG = {
  submitted: {
    className: 'pending',
    icon: '⏳',
    label: { en: 'Pending Review', he: 'ממתין לבדיקה' },
  },
  approved: {
    className: 'approved',
    icon: '✓',
    label: { en: 'Approved Community Book', he: 'ספר קהילתי מאושר' },
  },
  rejected: {
    className: 'rejected',
    icon: '✗',
    label: { en: 'Submission Rejected', he: 'ההגשה נדחתה' },
  },
};

const CommunityBookStatusBanner = ({ submissionStatus, rejectionReason, submittedBy }) => {
  if (!submissionStatus || !STATUS_CONFIG[submissionStatus]) return null;

  const config = STATUS_CONFIG[submissionStatus];
  const isOwner = Sefaria._uid === submittedBy;
  const showRejectionDetails = submissionStatus === 'rejected' && (isOwner || Sefaria.is_moderator);

  return (
    <div className={`communityBookStatusBanner ${config.className}`}>
      <span aria-hidden="true">{config.icon}</span>{' '}
      <strong><InterfaceText text={config.label} /></strong>
      {showRejectionDetails && rejectionReason && (
        <span>: {rejectionReason}</span>
      )}
      {submissionStatus === 'rejected' && isOwner && (
        <>
          <a href="/community-upload">
            <InterfaceText text={{ en: "Re-upload", he: "העלאה מחדש" }} />
          </a>
          <a href="/contact">
            <InterfaceText text={{ en: "Contact Us", he: "צרו קשר" }} />
          </a>
        </>
      )}
    </div>
  );
};

export default CommunityBookStatusBanner;
