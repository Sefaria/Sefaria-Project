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

    def next_index(self, starting_points):
        """
        Return the next populated address in a JA
        :param starting_points: An array indicating starting address in the JA
        """
        return self._dfs_traverse(self.store, starting_points)

    def prev_index(self, starting_points):
        """
        Return the previous populated address in a JA
        :param starting_points: An array indicating starting address in the JA
        """
        return self._dfs_traverse(self.store, starting_points, False)


    @staticmethod
    def _dfs_traverse(counts_map, starting_points=None, forward=True, depth=0):
        """
        Private function to recusrsively iterate through the counts doc to find the next available section
        :param counts_map: the counts doc map of available texts
        :param forward: if to move forward or backwards
        :param starting_points: the indices from which to start looking.
        :param depth: tracking parameter for recursion.
        :return: the indices where the next section is at.
        """
        #at the lowest level, we will have either strings or ints indicating text existence or not.
        if isinstance(counts_map, (int, basestring)):
            return bool(counts_map)

        #otherwise iterate through the sections
        else:
            #doesn't matter if we are out of bounds (slicing returns empty arrays for illegal indices)
            if forward:
                #we have been told where to start looking
                if depth < len(starting_points):
                    begin_index = starting_points[depth]
                    #this is in case we come back to this depth, then we want to start from 0 becasue the start point only matters for the
                    #array element we were in to begin with
                    starting_points[depth] = 0
                else:
                    begin_index = 0
                #we are going in order, so we want the next element (we also want to preserve the original indices)
                #TODO: this is a bit of wasted memory allocation, but have not yet found a better way
                section_to_traverse = enumerate(counts_map[begin_index:], begin_index)
            else:
                if depth < len(starting_points):
                    #we want to include the element we are on when going backwards.
                    begin_index = starting_points[depth] + 1 if starting_points[depth] is not None else None
                    #this will make the slice go to the end.
                    starting_points[depth] = None
                else:
                    begin_index = None
                #we are going in reverse, so we want everything up to the current element.
                #this weird hack will preserve the original numeric indices and allow reverse iterating
                section_to_traverse = reversed(list(enumerate(counts_map[:begin_index])))

            for n, j in section_to_traverse:
                result = JaggedArray._dfs_traverse(j, starting_points, forward, depth+1)
                if result:
                    #if we have a result, add the index location to a list that will eventually map to this section.
                    indices = [n] + result if isinstance(result, list) else [n]
                    return indices
            return False


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