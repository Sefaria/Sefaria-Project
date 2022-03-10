.. Sefaria documentation master file, created by
   sphinx-quickstart on Tue Sep 23 14:07:10 2014.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.


Core text classes from sefaria.model.text
=========================================
.. toctree::
   :maxdepth: 2

* :ref:`genindex`
* :ref:`search`

.. py:module:: sefaria.model.text

Library
-------

.. autoclass:: Library
    :members:
    :inherited-members:
    :undoc-members:

Ref
---

.. autoclass:: Ref



Displaying Refs
~~~~~~~~~~~~~~~

	.. automethod:: Ref.normal
	.. automethod:: Ref.he_normal
	.. automethod:: Ref.url



Inspecting Refs
~~~~~~~~~~~~~~~

	.. automethod:: Ref.is_ref
	.. automethod:: Ref.is_commentary
	.. automethod:: Ref.is_talmud
	.. automethod:: Ref.is_bavli
	.. automethod:: Ref.is_range
	.. automethod:: Ref.is_spanning
	.. automethod:: Ref.is_section_level
	.. automethod:: Ref.is_segment_level
	.. automethod:: Ref.range_depth
	.. automethod:: Ref.range_index
	.. automethod:: Ref.range_list
	.. automethod:: Ref.range_size
	.. automethod:: Ref.span_size



Comparing Refs
~~~~~~~~~~~~~~

	.. automethod:: Ref.contains
	.. automethod:: Ref.follows
	.. automethod:: Ref.precedes
	.. automethod:: Ref.overlaps
	.. automethod:: Ref.in_terms_of
	.. automethod:: Ref.__eq__
	.. automethod:: Ref.__ne__



Deriving Refs from Refs
~~~~~~~~~~~~~~~~~~~~~~~

	.. automethod:: Ref.padded_ref
	.. automethod:: Ref.subref
	.. automethod:: Ref.subrefs
	.. automethod:: Ref.all_subrefs
	.. automethod:: Ref.context_ref
	.. automethod:: Ref.section_ref
	.. automethod:: Ref.top_section_ref
	.. automethod:: Ref.starting_ref
	.. automethod:: Ref.ending_ref
	.. automethod:: Ref.split_spanning_ref
	.. automethod:: Ref.next_section_ref
	.. automethod:: Ref.prev_section_ref
	.. automethod:: Ref.next_segment_ref
	.. automethod:: Ref.prev_segment_ref
	.. automethod:: Ref.last_segment_ref
	.. automethod:: Ref.surrounding_ref
	.. automethod:: Ref.to



Getting other data with Refs
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	.. automethod:: Ref.is_text_fully_available
	.. automethod:: Ref.is_text_translated
	.. automethod:: Ref.regex
	.. automethod:: Ref.text
	.. automethod:: Ref.versionset
	.. automethod:: Ref.version_list
	.. automethod:: Ref.linkset
	.. automethod:: Ref.noteset
	.. automethod:: Ref.condition_query
	.. automethod:: Ref.part_projection
	.. automethod:: Ref.storage_address
	.. automethod:: Ref.get_state_ja
	.. automethod:: Ref.get_state_node



TextChunk and TextFamily
------------------------

.. autoclass:: TextChunk

	TextChunk.text: The text itself

	TextChunk.is_merged: (Boolean) is this a merged result?

	TextChunk.sources: List of sources used to create this TextChunk

.. autoclass:: TextFamily

	TextFamily.text: The English language text 
	
	TextFamily.he: The Hebrew language text

	.. automethod:: TextFamily.contents

	
Version
-------

.. autoclass:: Version

	.. autoattribute:: Version.required_attrs

	.. autoattribute:: Version.optional_attrs

.. autoclass:: VersionSet


Index
--------------------------

.. autoclass:: Index

	.. autoattribute:: Index.required_attrs

	.. autoattribute:: Index.optional_attrs

.. autoclass:: IndexSet


