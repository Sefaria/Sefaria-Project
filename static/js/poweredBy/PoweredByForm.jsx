import React, { useEffect, useRef, useState } from 'react';
import Sefaria from '../sefaria/sefaria';
import { InterfaceText } from '../Misc';
import {
  COPY,
  FORM_PAGES,
  LOGO_LEARN_MORE_URL,
  OTHER,
  emptyValues,
  fieldError,
  isFieldVisible,
  missingRequiredFields,
  submittedValues,
  validate,
} from './poweredByFormDefinition';

const HEADER_LOGO_SRC = "/static/img/powered-by-form-header.png";

const fieldDomId = (name) => "pbf-" + name;

const ErrorNote = ({error}) => (
  <div className="pbfErrorNote" role="alert">
    <span className="pbfErrorIcon" aria-hidden="true">!</span>
    <InterfaceText text={COPY[error]} />
  </div>
);

const FieldLabel = ({field, htmlFor, as = "label"}) => {
  const Tag = as;
  return (
    <Tag className="pbfLabel" htmlFor={as === "label" ? htmlFor : undefined}>
      <InterfaceText text={field.label} />{field.required ? "*" : null}
    </Tag>
  );
};

const OtherInput = ({field, values, setValue}) => (
  <input
    type="text"
    className="pbfInput pbfOtherInput"
    aria-label={Sefaria._v({en: OTHER, he: "אחר"})}
    value={values[field.otherName] || ""}
    onChange={e => setValue(field.otherName, e.target.value)}
  />
);

const ChoiceGroup = ({field, values, setValue, onBlur}) => {
  const multiple = field.type === "checkbox";
  const current = values[field.name];
  const toggle = (value, checked) => {
    if (!multiple) { setValue(field.name, value); return; }
    const list = current || [];
    setValue(field.name, checked ? list.concat([value]) : list.filter(v => v !== value));
  };
  return (
    <div className="pbfOptions">
      {field.options.map(option => {
        const checked = multiple ? (current || []).includes(option.value) : current === option.value;
        return (
          <React.Fragment key={option.value}>
            <label className="pbfOption">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={fieldDomId(field.name)}
                value={option.value}
                checked={checked}
                onChange={e => toggle(option.value, e.target.checked)}
                onBlur={onBlur}
              />
              <span><InterfaceText text={option.label} /></span>
            </label>
            {option.value === OTHER && field.otherName ?
              <OtherInput field={field} values={values} setValue={setValue} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

const Field = ({field, values, setValue, error, onBlur}) => {
  const id = fieldDomId(field.name);
  const value = values[field.name];
  const className = ["pbfField", "pbfField-" + field.width, field.required ? "pbfRequired" : "",
    error ? "pbfHasError" : ""].filter(Boolean).join(" ");
  const inputClass = "pbfInput" + (field.type === "textarea" ? " pbfTextarea" : "");

  if (field.type === "radio" || field.type === "checkbox") {
    return (
      <fieldset className={className} id={id} aria-invalid={!!error}>
        <FieldLabel field={field} as="legend" />
        {error ? <ErrorNote error={error} /> : null}
        <ChoiceGroup field={field} values={values} setValue={setValue} onBlur={() => onBlur(field)} />
        {field.help ? <div className="pbfHelp"><InterfaceText text={field.help} /></div> : null}
      </fieldset>
    );
  }

  const common = {
    id,
    name: field.name,
    className: inputClass,
    value: value || "",
    required: !!field.required,
    "aria-invalid": !!error,
    onChange: e => setValue(field.name, e.target.value),
    onBlur: () => onBlur(field),
  };
  let control;
  if (field.type === "select") {
    control = (
      <select {...common}>
        <option value="" />
        {field.options.map(o => (
          <option key={o.value} value={o.value}>{Sefaria._v(o.label)}</option>
        ))}
      </select>
    );
  } else if (field.type === "textarea") {
    control = <textarea {...common} rows={10} maxLength={field.maxLength} />;
  } else {
    control = (
      <input
        {...common}
        type={field.type === "email" ? "email" : "text"}
        inputMode={field.inputMode}
        autoComplete={field.autoComplete}
        placeholder={field.placeholder ? Sefaria._v(field.placeholder) : undefined}
      />
    );
  }
  return (
    <div className={className}>
      <FieldLabel field={field} htmlFor={id} />
      {error ? <ErrorNote error={error} /> : null}
      <div className="pbfControl">
        {control}
        {error ? <span className="pbfInputIcon" aria-hidden="true">!</span> : null}
      </div>
      {field.maxLength ?
        <div className="pbfCounter" aria-live="polite">
          <span className="pbfSrOnly"><InterfaceText text={COPY.charactersRemaining} /> </span>
          {String(value || "").length}/{field.maxLength}
        </div> : null}
    </div>
  );
};

const StaticBlock = ({item}) => {
  if (item.block === "heading") {
    return <h2 className="pbfSectionHeading"><InterfaceText text={COPY[item.copy]} /></h2>;
  }
  if (item.block === "logoIntro") {
    return (
      <div className="pbfRichText pbfField-full">
        <p><InterfaceText text={COPY.logoIntro} /></p>
        <p>
          <a href={LOGO_LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
            <InterfaceText text={COPY.logoLearnMore} />
          </a>
        </p>
      </div>
    );
  }
  return (
    <div className={"pbfRichText pbfField-full " + (item.className || "")}>
      <p><InterfaceText html={COPY[item.copy]} /></p>
      {item.second ? <p><InterfaceText html={COPY[item.second]} /></p> : null}
    </div>
  );
};

const pageErrorText = (page, total) => (
  Sefaria._v(COPY.pageError).replace("%{current}", page + 1).replace("%{total}", total)
);

/*
 * The Powered by Sefaria form. In "public" mode it is Formstack's two-page flow ending in
 * onSubmit. In "project" mode it is one continuous page with no buttons: the caller saves
 * through onChange and reads what is still missing through onMissingRequiredChange.
 */
const PoweredByForm = ({
  mode = "public",
  initialValues = null,
  initialPage = 0,
  hideEndpointSections = mode === "project",
  showHeaderLogo = mode === "public",
  onChange = null,
  onSubmit = null,
  onMissingRequiredChange = null,
}) => {
  const continuous = mode === "project";
  const [values, setValues] = useState(() => ({...emptyValues(), ...(initialValues || {})}));
  const [page, setPage] = useState(continuous ? 0 : initialPage);
  const [errors, setErrors] = useState({});
  const [pageErrorFields, setPageErrorFields] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const bannerRef = useRef(null);
  const topRef = useRef(null);
  const options = {hideEndpointSections};

  const missingKey = missingRequiredFields(values, options).join(",");
  useEffect(() => {
    if (onMissingRequiredChange) { onMissingRequiredChange(missingKey ? missingKey.split(",") : []); }
  }, [missingKey]);

  useEffect(() => {
    if (pageErrorFields && bannerRef.current) {
      bannerRef.current.focus();
      if (bannerRef.current.scrollIntoView) { bannerRef.current.scrollIntoView({block: "start"}); }
    }
  }, [pageErrorFields]);

  const items = continuous ? FORM_PAGES.flat() : FORM_PAGES[page];
  const fieldByName = Object.fromEntries(FORM_PAGES.flat().filter(i => i.name).map(i => [i.name, i]));

  const setValue = (name, value) => {
    const next = {...values, [name]: value};
    setValues(next);
    if (errors[name] !== undefined) {
      const field = fieldByName[name];
      const error = field ? fieldError(field, next) : null;
      setErrors(prev => {
        const updated = {...prev};
        if (error) { updated[name] = error; } else { delete updated[name]; }
        return updated;
      });
    }
    if (onChange) { onChange(next); }
  };

  const onBlur = (field) => {
    if (field.type === "radio" || field.type === "checkbox") { return; }
    const error = fieldError(field, values);
    setErrors(prev => {
      const updated = {...prev};
      if (error) { updated[field.name] = error; } else { delete updated[field.name]; }
      return updated;
    });
  };

  const checkPage = () => {
    const pageErrors = validate(values, {page, ...options});
    setErrors(pageErrors);
    const names = Object.keys(pageErrors);
    setPageErrorFields(names.length ? names : null);
    return names.length === 0;
  };

  const goTo = (nextPage) => {
    setPage(nextPage);
    setPageErrorFields(null);
    setErrors({});
    if (topRef.current && topRef.current.scrollIntoView) { topRef.current.scrollIntoView({block: "start"}); }
  };

  const next = () => { if (checkPage()) { goTo(page + 1); } };

  const submit = (e) => {
    e.preventDefault();
    if (continuous || submitting) { return; }
    if (page < FORM_PAGES.length - 1) { next(); return; }
    if (!checkPage()) { return; }
    if (!onSubmit) { return; }
    setSubmitting(true);
    Promise.resolve(onSubmit(submittedValues(values, options)))
      .finally(() => setSubmitting(false));
  };

  const isHebrew = Sefaria.interfaceLang === "hebrew";
  const lastPage = page === FORM_PAGES.length - 1;

  return (
    <form
      className={"pbfForm pbfMode-" + mode}
      dir={isHebrew ? "rtl" : "ltr"}
      lang={isHebrew ? "he" : "en"}
      noValidate
      onSubmit={submit}
      ref={topRef}
    >
      {showHeaderLogo ?
        <div className="pbfHeader"><img src={HEADER_LOGO_SRC} alt={Sefaria._v(COPY.logoAlt)} /></div> : null}

      {pageErrorFields ?
        <div className="pbfPageError" role="alert" tabIndex={-1} ref={bannerRef}>
          <p className="pbfPageErrorTitle">
            <span className="pbfErrorIcon" aria-hidden="true">!</span>
            {pageErrorText(page, FORM_PAGES.length)}
          </p>
          <ul>
            {pageErrorFields.map(name => (
              <li key={name}>
                <a href={"#" + fieldDomId(name)}><InterfaceText text={fieldByName[name].label} /></a>
              </li>
            ))}
          </ul>
        </div> : null}

      <div className="pbfGrid">
        {items.map((item, i) => {
          if (!item.name) { return <StaticBlock key={"block" + i} item={item} />; }
          if (!isFieldVisible(item, values, options)) { return null; }
          return (
            <Field key={item.name} field={item} values={values} setValue={setValue}
              error={errors[item.name]} onBlur={onBlur} />
          );
        })}
      </div>

      {continuous ? null :
        <div className="pbfButtons">
          {page > 0 ?
            <button type="button" className="pbfButton" onClick={() => goTo(page - 1)}>
              <InterfaceText text={COPY.previous} />
            </button> : <span />}
          {lastPage ?
            <button type="submit" className="pbfButton" disabled={submitting}>
              <InterfaceText text={submitting ? COPY.submitting : COPY.submit} />
            </button> :
            <button type="submit" className="pbfButton">
              <InterfaceText text={COPY.next} />
            </button>}
        </div>}
    </form>
  );
};

export default PoweredByForm;
