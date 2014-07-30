"""
jagged_array.py: a sparse array of arrays

http://stackoverflow.com/questions/8180014/how-to-subclass-python-list-without-type-problems
https://docs.python.org/2/reference/datamodel.html
Mutable sequences should provide methods
append(), count(), index(), extend(), insert(), pop(), remove(), reverse() and sort(),
like Python standard list objects.
Finally, sequence types should implement addition (meaning concatenation) and multiplication (meaning repetition)
by defining the methods __add__(), __radd__(), __iadd__(), __mul__(), __rmul__() and __imul__() described below;
they should not define __coerce__() or other numerical operators.
It is recommended that both mappings and sequences implement the __contains__() method
to allow efficient use of the in operator; for mappings, in should be equivalent of has_key();
for sequences, it should search through the values.
It is further recommended that sequences implement the __iter__() method
to allow efficient iteration through the container; for sequences, it should iterate through the values.

If we're interested in .flatten() and also using yield and generators for other recursive functions
http://chimera.labs.oreilly.com/books/1230000000393/ch04.html#_problem_70
http://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do-in-python
"""


class JaggedArray(object):

    def __init__(self, ja=[]):
        self.store = ja


class JaggedTextArray(JaggedArray):

    def __init__(self, ja=[]):
        JaggedArray.__init__(self, ja)
        self.word_count = None
        self.char_count = None

    #Intention is to call this when the contents of the JA change, so that counts don't get stale
    def _reinit(self):
        self.word_count = None
        self.char_count = None

    def count_words(self):
        """ return word count in this JTA """
        if self.word_count is None:
            self.word_count = self._wcnt(self.store)
        return self.word_count if self.word_count else 0

    def _wcnt(self, jta):
        """ Returns the number of characters in an undecorated jagged array """
        if isinstance(jta, basestring):
            return len(jta.split(" "))
        elif isinstance(jta, list):
            return sum([self._wcnt(i) for i in jta])
        else:
            return 0

    def count_chars(self):
        """ return character count in this JTA """
        if self.char_count is None:
            self.char_count = self._ccnt(self.store)
        return self.char_count if self.char_count else 0

    def _ccnt(self, jta):
        """ Returns the number of characters in an undecorated jagged array """
        if isinstance(jta, basestring):
            return len(jta)
        elif isinstance(jta, list):
            return sum([self._ccnt(i) for i in jta])
        else:
            return 0


class JaggedCountArray(JaggedArray):
    pass