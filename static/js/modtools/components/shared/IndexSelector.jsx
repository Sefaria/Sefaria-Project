/**
 * IndexSelector - Reusable checkbox list for selecting indices
 *
 * Used by BulkVersionEditor, BulkIndexEditor, and AutoLinkCommentaryTool
 * to display a list of indices with select-all/deselect-all functionality.
 *
 * Features:
 * - Select All / Deselect All buttons
 * - Selection count display ("12 of 47 selected")
 * - Visual distinction for selected items
 *
 * For AI agents: This component manages a Set of selected indices.
 * The onSelectionChange callback receives the new Set when selection changes.
 */
import React from 'react';
import PropTypes from 'prop-types';

const IndexSelector = ({
  indices,
  selectedIndices,
  onSelectionChange,
  label = 'indices',
  maxHeight = '200px'
}) => {
  if (!indices || indices.length === 0) return null;

  const selectAll = () => {
    onSelectionChange(new Set(indices));
  };

  const deselectAll = () => {
    onSelectionChange(new Set());
  };

  const toggleOne = (index, checked) => {
    const newSet = new Set(selectedIndices);
    if (checked) {
      newSet.add(index);
    } else {
      newSet.delete(index);
    }
    onSelectionChange(newSet);
  };

  const allSelected = selectedIndices.size === indices.length;
  const noneSelected = selectedIndices.size === 0;

  return (
    <div className="indexSelectorContainer">
      {/* Selection Controls Header */}
      <div className="selectionControls">
        <div className="selectionButtons">
          <button
            type="button"
            className="modtoolsButton small"
            onClick={selectAll}
            disabled={allSelected}
          >
            Select All
          </button>
          <button
            type="button"
            className="modtoolsButton small secondary"
            onClick={deselectAll}
            disabled={noneSelected}
          >
            Deselect All
          </button>
        </div>
        <span className="selectionCount">
          <strong>{selectedIndices.size}</strong> of <strong>{indices.length}</strong> {label} selected
        </span>
      </div>

      {/* Index List */}
      <div className="indicesList" style={{ maxHeight }}>
        {indices.map(t => (
          <label
            key={t}
            className={selectedIndices.has(t) ? 'selected' : ''}
          >
            <input
              type="checkbox"
              checked={selectedIndices.has(t)}
              onChange={e => toggleOne(t, e.target.checked)}
            />
            <span className="indexTitle">{t}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

IndexSelector.propTypes = {
  indices: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedIndices: PropTypes.instanceOf(Set).isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  label: PropTypes.string,
  maxHeight: PropTypes.string
};

export default IndexSelector;
