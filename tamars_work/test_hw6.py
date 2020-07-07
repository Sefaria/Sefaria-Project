from LinkedList import LinkedList
from random import randint
import sys
import pytest

class FakeLL(object):
    def __init__(self):
        self.__l = []
        
    def isEmpty(self): return len(self.__l) == 0
    
    def __len__(self): return len(self.__l)
    
    def insert(self, key, data):
        t = key,data
        self.__l = [t] + self.__l
        
    def reverse(self): self.__l.reverse()
        
    # return a tuple containing the key/data pair associated with key. 
    # return None if key couldn't be found in the list.
    def find(self, key):  
        for t in self.__l:
            if t[0] == key:
                return t[0], t[1]
        return None
    
    # returns a randomly chosen key that is in this fake LL
    def randKey(self):
        if len(self.__l) == 0: return 10 # a random key
        loc = randint(0, len(self.__l)-1)
        return self.__l[loc][0]
    
    # return the key of the last element in this fake LL
    def lastKey(self):
        if len(self.__l) == 0: return None
        return self.__l[-1][0]     
           
    # attempt to insert a new Node containing newKey/NewData
    # into the linked list immediately after the first node
    # containing key. Return True on success, False otherwise.
    def insertAfter(self, key, newKey, newData):
        l = self.__l
        for i in range(len(l)):
            if l[i][0] == key:
                self.__l = l[:i+1] + [(newKey, newData)] + l[i+1:]
                return True
            
        return False
            
    # delete a node from the linked list, returning the key/data
    # pair of the deleted node. If key == None, then just delete
    # the first node. Otherwise, attempt to find and delete 
    # the first node containing key
    def delete(self, key = None):
        l = self.__l
        if len(l) == 0: return None
        if key == None:
            ans = l[0][0], l[0][1]
            self.__l = l[1:]
            return ans
        
        for i in range(len(l)):
            if l[i][0] == key:
                ans = l[i][0], l[i][1]
                self.__l = l[:i] + l[i+1:]
                return ans
            
        return None

    def nodeStr(self, t): return "{" + str(t[0]) + ", " + str(t[1]) + "}"
    
    def __str__(self): 
        ans = "("

        l = self.__l
        if len(l) > 0: ans += self.nodeStr(l[0])
        for i in range(1, len(l)): ans += " ==> " + self.nodeStr(l[i])
            
        return ans + ")"                

    def insertLast(self, key, data):
        self.__l.append((key,data))
        
    def flipFirstTwo(self):
        l = self.__l
        if len(l) > 1:
            l[0], l[1] = l[1], l[0]
            
    def nthItem(self, n):
        ans = None
        l = self.__l

        if n >= 0 and n < len(l):
            ans = l[n][0], l[n][1]
            
        return ans
            
            


chunkSize = 20
randRange = 100000
crawlSize = 500
tortureSize = 1000

def primeLists(size = chunkSize):
    # Prime the lists with some nodes and make sure things are the same
    l, f = LinkedList(), FakeLL()
    for i in range(size): 
        key = randint(1, randRange)
        data = randint(1, randRange)
        l.insert(key, data)
        f.insert(key, data)  
    assert str(l) == str(f)
    return l, f




def test_insertAtHead():
    l, f = primeLists(0)
    
    for i in range(chunkSize):
        key = randint(1, randRange)
        data = randint(1, randRange)
        l.insert(key, data)
        f.insert(key, data)
        assert str(l) == str(f)
    assert len(l) == chunkSize
    assert len(l) == len(f)
        
def test_removeFromHead(): 
    l, f = primeLists()
    
    assert len(f) == chunkSize
    for i in range(chunkSize * 2):
        assert l.delete() == f.delete()
        assert str(l) == str(f)
        assert len(l) == len(f)
        
def test_removeFromTailUntilEmpty():
    l,f = primeLists()
    for i in range(chunkSize * 2):
        k = f.lastKey()
        if k != None:
            assert l.delete(k) == f.delete(k)
            assert str(l) == str(f) 
        assert len(l) == len(f)
    assert len(l) == 0 and len(f) == 0

def test_insertLast():
    l, f = primeLists(0)
    for i in range(chunkSize): # chunkSize
        key = randint(1, randRange)
        data = randint(1, randRange)    
        l.insertLast(key, data)
        f.insertLast(key, data)
        #x = 1/0
        assert str(l) == str(f)
        assert len(l) == len(f)      

def test_removeRandomUntilEmpty():
    l, f = primeLists()
    for i in range(chunkSize * 2):
        k = f.randKey()
        assert l.delete(k) == f.delete(k)
        assert str(l) == str(f)
        assert len(l) == len(f)

        
def test_RightwardCrawl():
    # Prime the lists with some nodes and make sure things are the same
    l, f = primeLists()
    
    # Now start the crawl around to the right
    for i in range(crawlSize):
        # first add one at the tail and make sure things are the same
        key = randint(1, randRange)
        data = randint(1, randRange)
        l.insertLast(key, data)
        f.insertLast(key, data)
        assert str(l) == str(f)
       
        # now remove one at the head, and make sure the results are the same
        assert l.delete() == f.delete()
        assert str(l) == str(f)   

def test_leftwardCrawl():
    # Prime the lists with some nodes
    l, f = primeLists()
        
    # Now start the crawl around to the left
    for i in range(crawlSize):
        # first add one at the head and make sure both implementations agree
        key = randint(1, randRange)
        data = randint(1, randRange)
        l.insert(key, data)
        f.insert(key, data)
        assert str(l) == str(f)
       
        # now remove one at the tail and make sure both implementations agree
        k = f.lastKey()
        assert l.delete(k) == f.delete(k)
        assert str(l) == str(f) 
        
        assert str(l) == str(f)
        assert len(l) == len(f)  
        
def test_insertAfter():
    # first try to insert after an empty list
    l, f = primeLists(0)
    assert l.insertAfter(12, "foo", "foo") == f.insertAfter(12, "foo", "foo")
    assert len(l) == len(f)
    
    # Now try to insert after a list that has just one element
    l, f = primeLists(0)
    assert l.insert(1, 1) == f.insert(1, 1)
    assert l.insertAfter(1, 2, 2) == f.insertAfter(1, 2, 2)
    assert str(l) == str(f)
    assert len(l) == len(f)
    
    # now try to insert between elements one and two
    l, f = primeLists(0)
    assert l.insert(1, 1) == f.insert(1, 1)
    assert l.insert(3, 3) == f.insert(3, 3)
    assert l.insertAfter(1, 2, 2) == f.insertAfter(1, 2, 2)
    assert str(l) == str(f)
    assert len(l) == len(f)    
    
    # now try to insert after element two
    l, f = primeLists(0)
    assert l.insert(1, 1) == f.insert(1, 1)
    assert l.insert(3, 3) == f.insert(3, 3)
    assert l.insertAfter(3, 2, 2) == f.insertAfter(3, 2, 2)
    assert str(l) == str(f)
    assert len(l) == len(f)    
        


        
def test_len():
    for size in range(0, 20):
        l, f = primeLists(size)
        assert len(l) == len(f)

def test_flip():
    for size in range(0, 20):
        l, f = primeLists(size)      
        l.flipFirstTwo()
        f.flipFirstTwo()
        assert str(l) == str(f)
        assert len(l) == len(f)
        
def testN():
    for size in range(0, 20):
        l, f = primeLists(size)
        for i in range(-1, size+1):
            ans1 = l.nthItem(i)
            ans2 = f.nthItem(i)
            assert ans1 == ans2
            
def test_insertLast():
    l, f = primeLists(0)
    for i in range(chunkSize): # chunkSize
        key = randint(1, randRange)
        data = randint(1, randRange)    
        l.insertLast(key, data)
        f.insertLast(key, data)
        #x = 1/0
        assert str(l) == str(f)
        assert len(l) == len(f) 
        
def test_Torture():
    l, f = primeLists()
    
    # finally the torture test
    for i in range(tortureSize):
        assert str(l) == str(f)
        assert len(l) == len(f)  
            
        # flip a coin and decide what to do
        choice = randint(1, 4)
        amount = randint(1, 10)
        if choice == 1: # find
            for j in range(amount):
                k = f.randKey()
                assert l.find(k) == f.find(k)
            
        elif choice == 2: # insert
            which = randint(1, 3)
            for j in range(amount):
                key = randint(1, randRange)
                data = randint(1, randRange)
                if which == 1:  # insert at front
                    l.insert(key, data)
                    f.insert(key, data)
                    assert str(l) == str(f)
 
                elif which == 2: # insert at end
                    assert l.insertLast(key, data) == f.insertLast(key, data) 
                    assert str(l) == str(f)
              
                else: # insert at random location
                    k = f.randKey()
                    assert l.insertAfter(k, key, data) == f.insertAfter(k, key, data)
                    assert str(l) == str(f)
                
        elif choice == 3: # delete
            for j in range(amount):
                which = randint(1, 3)
                if which == 1: # delete first
                    assert l.delete() == f.delete()
                    assert str(l) == str(f)
                    
                elif which == 2: # delete random
                    k = f.randKey()
                    assert l.delete(k) == f.delete(k)
                    assert str(l) == str(f)
                    
                else: # delete last
                    k = f.lastKey()
                    assert l.delete(k) == f.delete(k)
                    assert str(l) == str(f)
        else:
            l.flipFirstTwo()
            f.flipFirstTwo()
    
        assert str(l) == str(f)


                
pytest.main(["-v", "-s", "test_hw6.py"])

