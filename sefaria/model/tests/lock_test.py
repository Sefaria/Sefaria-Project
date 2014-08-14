import datetime

import sefaria.model.lock as lock


def test_locks():
    ref = "Mishnah Oktzin 1:3"
    lang = "en"
    version = "Sefaria Community Translation"
    user = 0

    lock.release_lock(ref, lang, version)
    lock.set_lock(ref, lang, version, user)
    assert lock.check_lock(ref, lang, version)
    lock.release_lock(ref, lang, version)
    assert not lock.check_lock(ref, lang, version)

    # test expiring locks
    twice_cutoff_ago = datetime.datetime.now() - datetime.timedelta(seconds=(lock.LOCK_TIMEOUT * 2))
    lock.Lock({
        "ref": ref,
        "lang": lang,
        "version": version,
        "user": user,
        "time": twice_cutoff_ago,
    }).save()
    assert lock.check_lock(ref, lang, version)
    lock.expire_locks()
    assert not lock.check_lock(ref, lang, version)
