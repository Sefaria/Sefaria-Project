import React, { useState, useRef, useCallback } from 'react';
import ReactTags from 'react-tag-autocomplete';
import Sefaria from './sefaria/sefaria';
import { InterfaceText } from './Misc';
import { uploadCommunityBook, confirmCommunityBook, LICENSE_OPTIONS } from './communityBooksApi';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const CommunityUploadPage = ({ multiPanel, menuOpen, openMenu, openNav, openDisplaySettings, toggleLanguage, toggleSignUpModal }) => {
  // Form state
  const [titleEn, setTitleEn] = useState('');
  const [titleHe, setTitleHe] = useState('');
  const [structureType, setStructureType] = useState('depth2');
  const [language, setLanguage] = useState('en');
  const [descEn, setDescEn] = useState('');
  const [descHe, setDescHe] = useState('');
  const [topics, setTopics] = useState([]);
  const [topicSuggestions, setTopicSuggestions] = useState([]);
  const [file, setFile] = useState(null);
  const [license, setLicense] = useState(LICENSE_OPTIONS[0].value);
  const [guideChecked, setGuideChecked] = useState(false);
  const [tosChecked, setTosChecked] = useState(false);

  // Flow state
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);  // { chapters, totalWordCount, detectedDepth, gcsUrl }
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null); // { bookId, title, url }
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  const fileInputRef = useRef(null);

  // -----------------------------------------------------------------------
  // Topic autocomplete handlers (mirrors PublishMenu pattern)
  // -----------------------------------------------------------------------
  const updateTopicSuggestions = useCallback((input) => {
    if (!input) return;
    Sefaria.getName(input, 5, ['Topic']).then((d) => {
      const suggestions = (d.completion_objects || []).map((obj, index) => ({
        id: index,
        name: obj.title,
        slug: obj.key,
      }));
      setTopicSuggestions(suggestions);
    });
  }, []);

  const onTopicDelete = (i) => {
    setTopics((prev) => {
      const next = prev.slice();
      next.splice(i, 1);
      return next;
    });
  };

  const onTopicAddition = (tag) => {
    setTopics((prev) => [...prev, tag]);
  };

  const onTopicValidate = (newTag) => {
    const isSuggestion = topicSuggestions.some((s) => s.slug === newTag.slug);
    const isNew = topics.every((t) => t.name !== newTag.name);
    return isNew && isSuggestion;
  };

  // -----------------------------------------------------------------------
  // File input handlers
  // -----------------------------------------------------------------------
  const handleFileChange = (e) => {
    const chosen = e.target.files && e.target.files[0];
    if (!chosen) return;
    validateAndSetFile(chosen);
  };

  const validateAndSetFile = (chosen) => {
    const errs = { ...validationErrors };
    const ext = chosen.name.split('.').pop().toLowerCase();
    if (ext !== 'docx') {
      errs.file = 'Only .docx files are accepted.';
      setValidationErrors(errs);
      return;
    }
    if (chosen.size > MAX_FILE_SIZE_BYTES) {
      errs.file = 'File must be smaller than 10 MB.';
      setValidationErrors(errs);
      return;
    }
    delete errs.file;
    setValidationErrors(errs);
    setFile(chosen);
  };

  // -----------------------------------------------------------------------
  // Client-side validation
  // -----------------------------------------------------------------------
  const validate = () => {
    const errs = {};
    if (!titleEn.trim()) errs.titleEn = 'English title is required.';
    if (!titleHe.trim()) errs.titleHe = 'Hebrew title is required.';
    if (!file) errs.file = 'Please select a .docx file to upload.';
    if (!license) errs.license = 'Please select a license.';
    if (!guideChecked) errs.guide = 'Please confirm you have read the formatting guide.';
    if (!tosChecked) errs.tos = 'Please accept the terms of service.';
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // -----------------------------------------------------------------------
  // Upload & confirm handlers
  // -----------------------------------------------------------------------
  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('titleEn', titleEn.trim());
    formData.append('titleHe', titleHe.trim());
    formData.append('structureType', structureType);
    formData.append('language', language);
    formData.append('descEn', descEn.trim());
    formData.append('descHe', descHe.trim());
    formData.append('topics', JSON.stringify(topics.map((t) => ({ asTyped: t.name, slug: t.slug }))));
    formData.append('license', license);

    setUploading(true);
    try {
      const result = await uploadCommunityBook(formData);
      setPreview({ ...result.preview, gcsUrl: result.gcsUrl });
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    setConfirming(true);
    try {
      const bookData = {
        titleEn: titleEn.trim(),
        titleHe: titleHe.trim(),
        structureType,
        language,
        descEn: descEn.trim(),
        descHe: descHe.trim(),
        topics: topics.map((t) => ({ asTyped: t.name, slug: t.slug })),
        license,
        gcsUrl: preview.gcsUrl,
      };
      const result = await confirmCommunityBook(bookData);
      setConfirmed(result);
    } catch (err) {
      setError(err.message || 'Submission failed. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived helpers
  // -----------------------------------------------------------------------
  const selectedLicense = LICENSE_OPTIONS.find((opt) => opt.value === license);
  const hasFile = !!file;

  // -----------------------------------------------------------------------
  // Render: success state
  // -----------------------------------------------------------------------
  if (confirmed) {
    return (
      <div className="readerNavMenu communityUploadPage">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <div className="successMessage">
                <strong>
                  <InterfaceText text={{ en: 'Book Submitted!', he: 'הספר הוגש בהצלחה!' }} />
                </strong>
                {' '}
                <InterfaceText text={{ en: 'Your book is now under review.', he: 'הספר שלך נמצא כעת בבדיקה.' }} />
                {confirmed.url && (
                  <>
                    {' '}
                    <a href={confirmed.url}>
                      <InterfaceText text={{ en: 'View your book', he: 'צפה בספר' }} />
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: preview + confirm state
  // -----------------------------------------------------------------------
  if (preview) {
    return (
      <div className="readerNavMenu communityUploadPage">
        <div className="content">
          <div className="sidebarLayout">
            <div className="contentInner">
              <h1>
                <InterfaceText text={{ en: 'Upload Preview', he: 'תצוגה מקדימה של העלאה' }} />
              </h1>

              {error && (
                <div className="errorBanner">
                  {error}{' '}
                  <a href="/contact">
                    <InterfaceText text={{ en: 'Contact Us', he: 'צרו קשר' }} />
                  </a>
                </div>
              )}

              <div className="structurePreview">
                <h3>
                  <InterfaceText text={{ en: 'Detected Structure', he: 'מבנה שזוהה' }} />
                </h3>
                <ul className="chapterList">
                  {preview.chapters.map((ch, i) => (
                    <li key={i} className="chapterItem">
                      <span className="chapterTitle">{ch.title}</span>
                      <span className="chapterMeta">
                        <span>
                          {ch.sectionCount}{' '}
                          <InterfaceText text={{ en: 'sections', he: 'קטעים' }} />
                        </span>
                        <span>
                          {ch.wordCount.toLocaleString()}{' '}
                          <InterfaceText text={{ en: 'words', he: 'מילים' }} />
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p style={{ marginTop: '12px', fontSize: '13px', color: '#555' }}>
                  <InterfaceText text={{ en: 'Total words:', he: 'סך מילים:' }} />{' '}
                  <strong>{preview.totalWordCount.toLocaleString()}</strong>
                </p>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
                <button
                  className="submitButton"
                  onClick={handleConfirm}
                  disabled={confirming}
                >
                  {confirming
                    ? <InterfaceText text={{ en: 'Submitting…', he: 'שולח…' }} />
                    : <InterfaceText text={{ en: 'Confirm Submission', he: 'אישור הגשה' }} />}
                </button>
                <button
                  className="submitButton"
                  style={{ background: '#888' }}
                  onClick={() => { setPreview(null); setError(''); }}
                  disabled={confirming}
                >
                  <InterfaceText text={{ en: 'Back to Form', he: 'חזרה לטופס' }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: upload form
  // -----------------------------------------------------------------------
  return (
    <div className="readerNavMenu communityUploadPage">
      <div className="content">
        <div className="sidebarLayout">
          <div className="contentInner">
            <h1>
              <InterfaceText text={{ en: 'Upload Your Book', he: 'העלאת ספר' }} />
            </h1>

            {error && (
              <div className="errorBanner">
                {error}{' '}
                <a href="/contact">
                  <InterfaceText text={{ en: 'Contact Us', he: 'צרו קשר' }} />
                </a>
              </div>
            )}

            <form className="uploadForm" onSubmit={handleUpload} noValidate>

              {/* Book title (English) */}
              <div className={`formField${validationErrors.titleEn ? ' hasError' : ''}`}>
                <label htmlFor="titleEn">
                  <InterfaceText text={{ en: 'Book Title (English)', he: 'כותרת הספר (אנגלית)' }} />
                  {' *'}
                </label>
                <input
                  id="titleEn"
                  type="text"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  placeholder="Enter English title"
                />
                {validationErrors.titleEn && (
                  <span className="fieldError">{validationErrors.titleEn}</span>
                )}
              </div>

              {/* Book title (Hebrew) */}
              <div className={`formField${validationErrors.titleHe ? ' hasError' : ''}`}>
                <label htmlFor="titleHe">
                  <InterfaceText text={{ en: 'Book Title (Hebrew)', he: 'כותרת הספר (עברית)' }} />
                  {' *'}
                </label>
                <input
                  id="titleHe"
                  type="text"
                  value={titleHe}
                  onChange={(e) => setTitleHe(e.target.value)}
                  placeholder="הכנס כותרת עברית"
                  dir="rtl"
                />
                {validationErrors.titleHe && (
                  <span className="fieldError">{validationErrors.titleHe}</span>
                )}
              </div>

              {/* Structure type */}
              <div className="formField">
                <label>
                  <InterfaceText text={{ en: 'Structure Type', he: 'סוג המבנה' }} />
                </label>
                <div className="radioGroup">
                  <label>
                    <input
                      type="radio"
                      name="structureType"
                      value="depth1"
                      checked={structureType === 'depth1'}
                      onChange={() => setStructureType('depth1')}
                    />
                    <InterfaceText text={{ en: 'Chapters only', he: 'פרקים בלבד' }} />
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="structureType"
                      value="depth2"
                      checked={structureType === 'depth2'}
                      onChange={() => setStructureType('depth2')}
                    />
                    <InterfaceText text={{ en: 'Chapters + Sections', he: 'פרקים וסעיפים' }} />
                  </label>
                </div>
              </div>

              {/* Language of text */}
              <div className="formField">
                <label htmlFor="language">
                  <InterfaceText text={{ en: 'Language of Text', he: 'שפת הטקסט' }} />
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="he">Hebrew / עברית</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Description (English) */}
              <div className="formField">
                <label htmlFor="descEn">
                  <InterfaceText text={{ en: 'Description (English)', he: 'תיאור (אנגלית)' }} />
                </label>
                <textarea
                  id="descEn"
                  value={descEn}
                  onChange={(e) => setDescEn(e.target.value)}
                  placeholder="Briefly describe your book in English…"
                />
              </div>

              {/* Description (Hebrew) */}
              <div className="formField">
                <label htmlFor="descHe">
                  <InterfaceText text={{ en: 'Description (Hebrew)', he: 'תיאור (עברית)' }} />
                </label>
                <textarea
                  id="descHe"
                  value={descHe}
                  onChange={(e) => setDescHe(e.target.value)}
                  placeholder="תאר את הספר בקצרה בעברית…"
                  dir="rtl"
                />
              </div>

              {/* Topics */}
              <div className="formField">
                <label>
                  <InterfaceText text={{ en: 'Topics', he: 'נושאים' }} />
                </label>
                <ReactTags
                  allowNew={false}
                  tags={topics}
                  suggestions={topicSuggestions}
                  onDelete={onTopicDelete}
                  onAddition={onTopicAddition}
                  onValidate={onTopicValidate}
                  onInput={updateTopicSuggestions}
                  placeholderText={Sefaria._('Add a topic…')}
                  delimiters={['Enter', ',']}
                />
              </div>

              {/* File upload */}
              <div className={`formField${validationErrors.file ? ' hasError' : ''}`}>
                <label>
                  <InterfaceText text={{ en: 'Book File (.docx)', he: 'קובץ הספר (.docx)' }} />
                  {' *'}
                </label>
                <div
                  className={`fileUpload${hasFile ? ' hasFile' : ''}`}
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current && fileInputRef.current.click(); }}
                  style={{
                    border: '2px dashed ' + (validationErrors.file ? '#e53e3e' : hasFile ? '#18345a' : '#c8c8c8'),
                    borderRadius: '4px',
                    padding: '32px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: hasFile ? '#f0f4fa' : '#fafafa',
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                  {hasFile ? (
                    <span style={{ color: '#18345a', fontWeight: '600' }}>
                      {file.name}{' '}
                      <span style={{ fontWeight: '400', color: '#555' }}>
                        ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                      </span>
                    </span>
                  ) : (
                    <>
                      <div style={{ fontSize: '32px', marginBottom: '8px', color: '#666' }}>📄</div>
                      <div style={{ fontSize: '15px', color: '#555', marginBottom: '4px' }}>
                        <InterfaceText text={{ en: 'Click to select a .docx file', he: 'לחץ לבחירת קובץ .docx' }} />
                      </div>
                      <div style={{ fontSize: '12px', color: '#999' }}>
                        <InterfaceText text={{ en: 'Maximum file size: 10 MB', he: 'גודל מרבי: 10 MB' }} />
                      </div>
                    </>
                  )}
                </div>
                {validationErrors.file && (
                  <span className="fieldError">{validationErrors.file}</span>
                )}
              </div>

              {/* License */}
              <div className={`formField${validationErrors.license ? ' hasError' : ''}`}>
                <label htmlFor="license">
                  <InterfaceText text={{ en: 'License', he: 'רישיון' }} />
                  {' *'}
                </label>
                <select
                  id="license"
                  className="licenseSelect"
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                >
                  {LICENSE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {selectedLicense && (
                  <p className="licenseDescription">{selectedLicense.description}</p>
                )}
                {validationErrors.license && (
                  <span className="fieldError">{validationErrors.license}</span>
                )}
              </div>

              {/* Formatting guide checkbox */}
              <div className="checkboxField">
                <input
                  id="guideChecked"
                  type="checkbox"
                  checked={guideChecked}
                  onChange={(e) => setGuideChecked(e.target.checked)}
                />
                <label htmlFor="guideChecked">
                  <InterfaceText text={{
                    en: <>I have read the <a href="/community-upload-guide" target="_blank" rel="noopener noreferrer">formatting guide</a> and my document follows the required format.</>,
                    he: <>קראתי את <a href="/community-upload-guide" target="_blank" rel="noopener noreferrer">מדריך העיצוב</a> והמסמך שלי עומד בדרישות.</>,
                  }} />
                </label>
              </div>
              {validationErrors.guide && (
                <span className="fieldError validationError">{validationErrors.guide}</span>
              )}

              {/* TOS checkbox */}
              <div className="checkboxField">
                <input
                  id="tosChecked"
                  type="checkbox"
                  checked={tosChecked}
                  onChange={(e) => setTosChecked(e.target.checked)}
                />
                <label htmlFor="tosChecked">
                  <InterfaceText text={{
                    en: 'I agree to the Sefaria Terms of Service and confirm that I have the right to publish this content.',
                    he: 'אני מסכים לתנאי השימוש של ספריא ומאשר שיש לי זכות לפרסם תוכן זה.',
                  }} />
                </label>
              </div>
              {validationErrors.tos && (
                <span className="fieldError validationError">{validationErrors.tos}</span>
              )}

              {/* Submit */}
              <button
                type="submit"
                className="submitButton"
                disabled={uploading}
              >
                {uploading
                  ? <InterfaceText text={{ en: 'Uploading…', he: 'מעלה…' }} />
                  : <InterfaceText text={{ en: 'Upload & Preview', he: 'העלאה ותצוגה מקדימה' }} />}
              </button>

            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityUploadPage;
