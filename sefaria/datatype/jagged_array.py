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

"""


class JaggedArray(object):

    def __init__(self, ja=[]):
        self.store = ja


class JaggedTextArray(JaggedArray):

    def __init__(self, ja=[]):
        JaggedArray.__init__(self, ja)
        self.count = None

    def _reinit(self):
        self.count = None

    def count_words(self):
        """ return word count in this JTA """
        if self.count is None:
            self.count = wcnt(self.store)
        return self.count if self.count else 0


#These functions operate on undecorated JTAs
def wcnt(jta):
    if isinstance(jta, basestring):
        return len(jta.split(" "))
    elif isinstance(jta, list):
        return sum([wcnt(i) for i in jta])
    else:
        return 0