import datetime

import sefaria.model as model


def test_locks():
    ref = "Mishnah Oktzin 1:3"
    lang = "en"
    version = "Sefaria Community Translation"
    user = 0

    model.release_lock(ref, lang, version)
    model.set_lock(ref, lang, version, user)
    assert model.check_lock(ref, lang, version)
    model.release_lock(ref, lang, version)
    assert not model.check_lock(ref, lang, version)

    # test expiring locks
    twice_cutoff_ago = datetime.datetime.now() - datetime.timedelta(seconds=(model.lock.LOCK_TIMEOUT * 2))
    model.Lock({
        "ref": ref,
        "lang": lang,
        "version": version,
        "user": user,
        "time": twice_cutoff_ago,
    }).save()
    assert model.check_lock(ref, lang, version)
    model.expire_locks()
    assert not model.check_lock(ref, lang, version)
