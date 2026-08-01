import React from 'react';
import { InterfaceText } from './Misc';

const CommunityUploadGuidePage = () => {
  return (
    <div className="readerNavMenu communityUploadGuidePage">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">

            <div className="guideSection">
              <h2>
                <InterfaceText text={{ en: 'Supported Format', he: 'פורמט נתמך' }} />
              </h2>
              <p>
                <InterfaceText text={{
                  en: 'Only .docx files are supported. PDF, .doc, and other formats are not accepted.',
                  he: 'רק קבצי .docx נתמכים. PDF, .doc ופורמטים אחרים אינם מתקבלים.'
                }} />
              </p>
            </div>

            <div className="guideSection">
              <h2>
                <InterfaceText text={{ en: 'Chapters Only (Simple Structure)', he: 'פרקים בלבד (מבנה פשוט)' }} />
              </h2>
              <p>
                <InterfaceText text={{
                  en: 'Use Heading 2 for each chapter. The body text follows directly beneath each heading.',
                  he: 'השתמש בכותרת 2 עבור כל פרק. טקסט הגוף מופיע ישירות מתחת לכל כותרת.'
                }} />
              </p>
              <div className="exampleBlock">
                <pre>{`## Chapter 1: Introduction\nThis is the body text of chapter one.\n\n## Chapter 2: Main Ideas\nThis is the body text of chapter two.`}</pre>
              </div>
            </div>

            <div className="guideSection">
              <h2>
                <InterfaceText text={{ en: 'Chapters + Sections (Detailed Structure)', he: 'פרקים וסעיפים (מבנה מפורט)' }} />
              </h2>
              <p>
                <InterfaceText text={{
                  en: 'Use Heading 2 for chapters and Heading 3 for sections within each chapter.',
                  he: 'השתמש בכותרת 2 לפרקים ובכותרת 3 לסעיפים בתוך כל פרק.'
                }} />
              </p>
              <div className="exampleBlock">
                <pre>{`## Chapter 1: Introduction\n### Section 1: Background\nBackground text here.\n\n### Section 2: Overview\nOverview text here.\n\n## Chapter 2: Analysis\n### Section 1: First Point\nAnalysis text.`}</pre>
              </div>
            </div>

            <div className="guideSection">
              <h2>
                <InterfaceText text={{ en: 'Content Restrictions', he: 'הגבלות תוכן' }} />
              </h2>
              <ul>
                <li>
                  <InterfaceText text={{ en: 'No footnotes', he: 'אין הערות שוליים' }} />
                </li>
                <li>
                  <InterfaceText text={{ en: 'No tables', he: 'אין טבלאות' }} />
                </li>
                <li>
                  <InterfaceText text={{ en: 'No embedded images', he: 'אין תמונות מוטמעות' }} />
                </li>
              </ul>
            </div>

            <div className="guideSection">
              <h2>
                <InterfaceText text={{ en: 'Download Templates', he: 'הורדת תבניות' }} />
              </h2>
              <div className="templateLinks">
                <a href="/static/files/community-upload-template-depth1.docx" download>
                  <InterfaceText text={{
                    en: 'Template: Chapters Only',
                    he: 'תבנית: פרקים בלבד'
                  }} />
                </a>
                <a href="/static/files/community-upload-template-depth2.docx" download>
                  <InterfaceText text={{
                    en: 'Template: Chapters + Sections',
                    he: 'תבנית: פרקים וסעיפים'
                  }} />
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityUploadGuidePage;
