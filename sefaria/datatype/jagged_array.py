"""
jagged_array.py: a sparse array of arrays

"""

# WARNING! instanciation creates a *reference* to the passed array.
# This is fine for analysis, but for modification, may modify the original array

# All methods that modify self._store need to be aware of this
# Potentially problematic methods marked with '#warning, writes!'

import re


class JaggedArray(object):

    def __init__(self, ja=None):
        if ja is None:
            ja = []
        self._store = ja  # do not modify _store from outside the object.  See above.
        self.e_count = None
        self._depth = None

    #Intention is to call this when the contents of the JA change, so that counts don't get stale
    def _reinit(self):
        self.e_count = None
        self._depth = None

    def array(self):
        return self._store

    def is_first(self, indexes1, indexes2):
        """

        :param indexes1: list of 0 based indexes for digging len(indexes) levels into the array
        :param indexes2: ditto
        :return: True if indexes1 is before indexes2. If equal, False
        """

        #pad with 0s so their len == _depth
        N = self.get_depth()
        if len(indexes1) <= N:
            indexes1 += [0] * (N - len(indexes1))
        else:
            raise IndexError

        if len(indexes2) <= N:
            indexes2 += [0] * (N - len(indexes2))
        else:
            raise IndexError

        first_diff_index = 0
        for i in xrange(N):
            if indexes1[i] != indexes2[i]:
                first_diff_index = i
                break

        return indexes1[first_diff_index] < indexes2[first_diff_index]

    def distance(self, indexes1, indexes2):
        """

        :param indexes1: list of 0 based indexes for digging len(indexes) levels into the array
        :param indexes2: ditto
        :return: the distance, measured in array elements, between indexes1 and indexes2
        """

        if indexes1 == indexes2:
            return 0

        # make sure indexes1 represents earliest index
        if self.is_first(indexes2,indexes1):
            indexes1, indexes2 = (indexes2, indexes1)

        # pad with 0s so their len == _depth
        N = self.get_depth()
        if len(indexes1) <= N:
            indexes1 += [0] * (N - len(indexes1))
        else:
            raise IndexError

        if len(indexes2) <= N:
            indexes2 += [0] * (N - len(indexes2))
        else:
            raise IndexError

        first_diff_index = 0
        for i in xrange(N):
            if indexes1[i] != indexes2[i]:
                first_diff_index = i
                break


        if first_diff_index == N-1:
            #base case
            return abs(indexes1[-1] - indexes2[-1])
        else:
            #recurse
            distance = 0
            temp_start_index = indexes1[:]
            for i in xrange(indexes1[first_diff_index],indexes2[first_diff_index]+1):

                if indexes2[first_diff_index] == i:
                    temp_end_index = indexes2[:]
                else:
                    temp_end_index = temp_start_index[:]
                    # max out all indexes greater than first_diff_index

                    temp_subarray_indexes = [i]
                    for j in xrange(first_diff_index+1,N):
                        temp_end_index[j] = self.sub_array_length(temp_subarray_indexes) - 1
                        temp_subarray_indexes += [temp_end_index[j]]
                distance += self.distance(temp_start_index,temp_end_index)
                temp_start_index[first_diff_index] = i + 1
                # set all indexes greater than first_diff_index to zero because you've moved on to the next section
                for j in xrange(first_diff_index+1,N):
                    temp_start_index[j] = 0

            return distance + (indexes2[first_diff_index] - indexes1[first_diff_index])

    def sub_array_length(self, indexes=None, until_last_nonempty=False):
        """
        :param indexes:  a list of 0 based indexes, for digging len(indexes) levels into the array
        :param until_last_nonempty_section: True if you want to return the length of the last of the last nonempty (super-section, section, segment)
        :return: The length of the array at the provided index
        """
        if indexes is None:
            indexes = []
        a = self._store
        if len(indexes) == 0 and not until_last_nonempty:
            return len(a)
        for i in range(0, len(indexes)):
            if indexes[i] > len(a) - 1:
                return None
            a = a[indexes[i]]
        try:
            if until_last_nonempty and len(a) > 0 and type(a[-1]) == list:  # and not at end of `a`
                curr_result = len(a)
                while self.sub_array_length(indexes + [curr_result - 1]) == 0 and curr_result > 0:
                    curr_result -= 1
                result = curr_result
            else:
                result = len(a)
        except TypeError:
            result = 0
        return result

    def next_index(self, starting_points=None):
        """
        Return the next populated address in a JA
        :param starting_points: An array indicating starting address in the JA
        """
        return self._dfs_traverse(self._store, starting_points)

    def prev_index(self, starting_points=None):
        """
        Return the previous populated address in a JA
        :param starting_points: An array indicating starting address in the JA
        """
        return self._dfs_traverse(self._store, starting_points, False)

    def is_full(self, _cur=None):
        if _cur is None:
            return self.is_full(_cur=self._store)
        if isinstance(_cur, list):
            if not len(_cur):
                return False
            for a in _cur:
                if not self.is_full(a):
                    return False
        else:
            if not _cur:
                return False
        return True

    def is_empty(self, _cur=None):
        if _cur is None:
            return self.is_empty(_cur=self._store)
        if isinstance(_cur, list):
            if not len(_cur):
                return True
            return all([self.is_empty(a) for a in _cur])
        else:
            return not bool(_cur)

    def sections(self, _cur=[]):
        """
        List of valid indexes in this object, to depth one up from bottom
        :param _cur: list of indexes
        :return:
        """

        if self.get_depth() - 1 <= len(_cur):
            return [_cur]
        return reduce(lambda a, b: a + self.sections(b), [_cur + [i] for i in range(self.sub_array_length(_cur))], [])

    def non_empty_sections(self):
        return [s for s in self.sections() if not self.subarray(s).is_empty()]

    def element_count(self):
        if self.e_count is None:
            self.e_count = self._ecnt(self._store)
        return self.e_count if self.e_count else 0

    def _ecnt(self, jta):
        if isinstance(jta, list):
            return sum([self._ecnt(i) for i in jta])
        else:
            return 1

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
        if starting_points is None:
            starting_points = []

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

    def mask(self, __curr=None):
        """
        Returns a new jagged array which corresponds in shape to this jagged array,
        with each terminal element populated with 1 or 0
        if a truthy value is present in each position - 1, if not 0.
        :return JaggedIntArray:
        """
        if __curr is None:  # On simple call, return object.
            return JaggedIntArray(self.mask(self._store))
        if isinstance(__curr, list):  # on recursed calls, return array
            return [self.mask(c) for c in __curr]
        else:
            return 0 if not __curr else 1

    def zero_mask(self):
        """
        Returns a jagged array of identical shape to 'array'
        with all elements replaced by 0.
        """
        return self.constant_mask(0)

    def constant_mask(self, constant=None, __curr=None):
        if __curr is None:  # On simple call, return object.
            return JaggedIntArray(self.constant_mask(constant, self._store))
        if isinstance(__curr, list):
            return [self.constant_mask(constant, c) for c in __curr]
        else:
            return constant

    def get_depth(self):
        if not self._depth:
            self._depth = self.depth()
        return self._depth

    def depth(self, _cur=None, deep=False):
        """
        returns 1 for [n], 2 for [[n],[p]], etc.
        Special case returns zero for an empty array []
        :parm x - a list
        :param deep - whether or not to count a level when not all elements in
        that level are lists.
        e.g. [[], ""] has a list depth of 1 with depth=False, 2 with depth=True
        """

        if _cur is None:
            if not self._store:
                return 0
            return self.depth(_cur=self._store, deep=deep)
        if not isinstance(_cur, list):
            return 0
        elif len(_cur) > 0 and (deep or all(map(lambda y: isinstance(y, list), _cur))):
            return 1 + max([self.depth(y, deep=deep) for y in _cur])
        else:
            return 1

    # derived from TextChunk.trim_text
    def subarray_with_ref(self, ref):
        start = [i - 1 for i in ref.sections]
        end = [i - 1 for i in ref.toSections]
        return self.subarray(start, end)

    # derived from TextChunk.trim_text
    def subarray(self, start_indexes, end_indexes=None):
        """
        Trims a JA to the specifications of start_indexes and end_indexes
        This works on simple Refs and range refs of unlimited depth and complexity.
        :param txt:
        :return: List|String depending on depth of Ref
        """
        if not end_indexes:
            end_indexes = start_indexes

        assert len(start_indexes) == len(end_indexes)
        assert len(start_indexes) <= self.depth
        range_index = len(start_indexes)

        for i in range(0, len(start_indexes)):
            if start_indexes[i] != end_indexes[i]:
                range_index = i
                break
        sub = self._store[:]
        if not start_indexes:
            pass
        else:
            for i in range(0, len(start_indexes)):
                if range_index > i:  # Either not range, or range begins later.  Return simple value.
                    if isinstance(sub, list) and len(sub) > start_indexes[i]:
                        sub = sub[start_indexes[i]]
                    else:
                        return self.__class__([])
                elif range_index == i:  # Range begins here
                    start = start_indexes[i]
                    end = end_indexes[i] + 1
                    sub = sub[start:end]
                else:  # range_index < i, range continues here
                    begin = end = sub
                    for _ in range(range_index, i - 1):
                        begin = begin[0]
                        end = end[-1]
                    begin[0] = begin[0][start_indexes[i]:]
                    end[-1] = end[-1][:end_indexes[i] + 1]
        return self.__class__(sub)

    def resize(self, factor):
        """
        Return a resized jagged array for 'text' either up or down by int 'factor'.
        Size up if factor is positive, down if negative.
        Size up or down the number of times per factor's size.
        E.g., up twice for '2', down twice for '-2'.
        """
        if factor > 0:
            for i in range(factor):
                self._upsize()
        elif factor < 0:
            for i in range(abs(factor)):
                self._downsize()
        self._reinit()
        return self

    def normalize(self, terminal_depth=None, _cur=None, depth=1):
        """
        :param terminal_depth: The desired depth before which everything should be arrays
        :return: Bool if there were any actual modifications made or not. 
        Normalizes the array so on any given depth, there are either arrays (incl empty) or primitives, not both.
        e.g. [[], ""] becomes [[], []]
        """
        normalized = False
        if not terminal_depth:
            terminal_depth = self.depth(deep=True)
        if _cur is None:
            if not self._store:
                return normalized
            return self.normalize(terminal_depth=terminal_depth, _cur=self._store)
        if depth < terminal_depth:
            for i,elem in enumerate(_cur):
                if not isinstance(_cur[i], list):
                    if isinstance(_cur[i], basestring) and not len(_cur[i].strip()):
                        _cur[i] = []
                    else:
                        for _ in range(depth, terminal_depth):
                            _cur[i] = [_cur[i]]
                    normalized = True
                else:
                    res = self.normalize(terminal_depth=terminal_depth, _cur=_cur[i], depth=depth+1)
                    normalized = normalized or res
        return normalized

    # todo: move to JaggedTextArray?
    def _upsize(self, _cur=None):
        """
        Returns a jagged array for text which restructures the content of text
        to include one additional level of structure.
        ["One", "Two", "Three"] -> [["One"], ["Two"], ["Three"]]
        """
        if _cur is None:
            self._store = self._upsize(_cur=self._store)
            return self

        new_text = []
        for segment in _cur:
            if isinstance(segment, basestring):
                new_text.append([segment])
            elif isinstance(segment, list):
                new_text.append(self._upsize(segment))
        return new_text

    # todo: move to JaggedTextArray?
    def _downsize(self, _cur=None):
        """
        Returns a jagged array for text which restructures the content of text
        to include one less level of structure.
        Existing segments are concatenated with " "
        [["One1", "One2"], ["Two1", "Two2"], ["Three1", "Three2"]] - >["One1 One2", "Two1 Two2", "Three1 Three2"]
        """
        if _cur is None:
            self._store = self._downsize(_cur=self._store)
            return self

        if len(_cur) == 0:
            return ""

        new_text = []
        for segment in _cur:
            # Assumes segments are of uniform type, either all strings or all lists
            if isinstance(segment, basestring):
                return " ".join(_cur)
            elif isinstance(segment, list):
                new_text.append(self._downsize(segment))
        # Return which was filled in, defaulted to [] if both are empty
        return new_text

    def get_element(self, indx_list):
        sa = reduce(lambda a, i: a[i],
                    indx_list[:-1],
                    self._store
        )
        return sa[indx_list[-1]]

    # warning, writes!
    def set_element(self, indx_list, value, pad = None):
        '''
        Set element at position specified by indx_list to value.
        If JA is not big enough, pad with [] at higher levels, and value of pad variable at last level.
        :param indx_list:
        :param value:
        :param pad:
        :return:
        '''
        def pad_and_walk(arry, indx):
            if len(arry) <= indx:
                for _ in range(len(arry), indx + 1):
                    arry += [[]]
            return arry[indx]

        sa = reduce(pad_and_walk, #lambda a, i: a[i],
                    indx_list[:-1],
                    self._store
        )
        if len(sa) <= indx_list[-1]:
            sa += [pad] * (indx_list[-1] - len(sa) + 1)

        sa[indx_list[-1]] = value
        return self

    def flatten_to_array(self, _cur=None):
        if _cur is None:
            if not isinstance(self._store, list):
                return [self._store]
            return self.flatten_to_array(_cur=self._store)

        flat = []
        for el in _cur:
            if isinstance(el, list):
                flat += self.flatten_to_array(el)
            else:
                flat += [el]
        return flat

    def last_index(self, depth):
        if depth > self.get_depth():
            depth = self.get_depth()
        res = []
        next = self
        for _ in range(depth):
            try:
                res += [len(next.array()) - 1]
                next = next.subarray(res[-1:])
            except IndexError:
                # For sparse texts that end before the array ends
                return self.prev_index(res)
        return res

    def __eq__(self, other):
        return self._store == other._store

    def __len__(self):
        return self.sub_array_length()

    def length(self):
        return self.__len__()


class JaggedTextArray(JaggedArray):

    def __init__(self, ja=None):
        JaggedArray.__init__(self, ja)
        self.w_count = None
        self.c_count = None

    def _reinit(self):
        super(JaggedTextArray, self)._reinit()
        self.w_count = None
        self.c_count = None

    def verse_count(self):
        return self.element_count()

    def word_count(self):
        """ return word count in this JTA """
        if self.w_count is None:
            self.w_count = self._wcnt(self._store)
        return self.w_count if self.w_count else 0

    def _wcnt(self, jta):
        """ Returns the number of words in an undecorated jagged array """
        if isinstance(jta, basestring):
            return len(re.split(ur"[\s\u05be]+", jta.strip()))
        elif isinstance(jta, list):
            return sum([self._wcnt(i) for i in jta])
        else:
            return 0

    def char_count(self):
        """ return character count in this JTA """
        if self.c_count is None:
            self.c_count = self._ccnt(self._store)
        return self.c_count if self.c_count else 0

    def _ccnt(self, jta):
        """ Returns the number of characters in an undecorated jagged array """
        if isinstance(jta, basestring):
            return len(jta)
        elif isinstance(jta, list):
            return sum([self._ccnt(i) for i in jta])
        else:
            return 0

    def modify_by_function(self, func, _cur=None):
        """ Returns the jagged array but with each terminal string processed by func"""
        if _cur is None:
            return self.modify_by_function(func, _cur=self._store)
        if isinstance(_cur, basestring):
            return func(_cur)
        elif isinstance(_cur, list):
            return [self.modify_by_function(func, i) for i in _cur]

    def flatten_to_array(self, _cur=None):
        # Flatten deep jagged array to flat array

        if _cur is None:
            if isinstance(self._store, basestring):
                return [self._store]
            return self.flatten_to_array(_cur=self._store)

        flat = []
        for el in _cur:
            if isinstance(el, list):
                flat += self.flatten_to_array(el)
            else:
                flat += [unicode(el)]
        return flat

    def flatten_to_string(self, joiner=u" "):
        return joiner.join(self.flatten_to_array())

    #warning, writes!
    def trim_ending_whitespace(self, _cur=None):
        if _cur == None:
            self._store = self.trim_ending_whitespace(self._store)
            return self
        if not isinstance(_cur, list):  # shouldn't get here
            return _cur
        if not len(_cur):
            return _cur
        if isinstance(_cur[0], list):
            return [self.trim_ending_whitespace(part) for part in _cur]
        else: # depth 1
            final_index = len(_cur) - 1
            for i in range(final_index, -1, -1):
                if not _cur[i] or re.match(r"^\s*$", _cur[i]):
                    final_index = i - 1
                else:
                    break
            if not final_index == len(_cur) - 1:
                _cur = _cur[0:final_index + 1]
            return _cur

    def overlaps(self, other=None, _self_cur=None, _other_cur=None):
        """
        Returns True if self and other contain one or more positions where both are non empty.
        Runs recursively.
        """
        if other:
            return self.overlaps(_self_cur=self._store, _other_cur=other._store)
        if isinstance(_self_cur, list) and isinstance(_other_cur, list):
            for i in range(min(len(_self_cur), len(_other_cur))):
                if self.overlaps(_self_cur=_self_cur[i], _other_cur=_other_cur[i]):
                    return True
        if isinstance(_self_cur, basestring) and isinstance(_other_cur, basestring):
            if _self_cur and _other_cur:
                return True
        return False

class JaggedIntArray(JaggedArray):
    def add(self, other):
        return self.__add__(other)

    def __add__(self, other):
        """
        :return JaggedIntArray:
        """
        assert isinstance(other, JaggedIntArray)
        return JaggedIntArray(self._add(self._store, other._store))

    @staticmethod
    def _add(a, b):
        """
        Returns a multi-dimensional array which sums each position of
        two multidimensional arrays of ints. Missing elements are given 0 value.
        [[1, 2], [3, 4]] + [[2,3], [4]] = [[3, 5], [7, 4]]
        """
        # Treat None as 0
        if a is None:
            return JaggedIntArray._add(0, b)
        if b is None:
            return JaggedIntArray._add(a, 0)

        # If one value is an int while the other is a list,
        # Treat the int as an empty list.
        # Needed e.g, when a whole chapter is missing appears as 0
        if isinstance(a, int) and isinstance(b, list):
            return JaggedIntArray._add([],b)
        if isinstance(b, int) and isinstance(a, list):
            return JaggedIntArray._add(a,[])

        # If both are ints, return the sum
        if isinstance(a, int) and isinstance(b, int):
            return a + b
        # If both are lists, recur on each pair of values
        # map results in None value when element not present
        if isinstance(a, list) and isinstance(b, list):
            return [JaggedIntArray._add(a2, b2) for a2, b2 in map(None, a, b)]

        raise Exception("JaggedIntArray._sum() reached a condition it shouldn't have reached")

    def depth_sum(self, depth):
        return self._depth_sum(self._store, depth)

    @staticmethod
    def _depth_sum(curr, depth):
        """
        Sum the counts of a text at given depth to get the total number of a given kind of section
        E.g, for counts on all of Job, depth 0 counts chapters, depth 1 counts verses
        """
        if depth == 0:
            if isinstance(curr, int):
                return min(curr, 1)
            else:
                sum = 0
                for i in range(len(curr)):
                    sum += min(JaggedIntArray._depth_sum(curr[i], 0), 1)
                return sum
        else:
            sum = 0
            for i in range(len(curr)):
                sum += JaggedIntArray._depth_sum(curr[i], depth - 1)
            return sum