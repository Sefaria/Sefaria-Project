from django import forms
from django.http import HttpResponseRedirect
from django.shortcuts import render_to_response
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.contrib.auth import login, authenticate
from django.template import RequestContext

def register(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            new_user = form.save()
            user = authenticate(username=request.POST['username'],
                                password=request.POST['password1'])
            login(request, user)
            return HttpResponseRedirect("/")
    else:
        form = UserCreationForm()

    return render_to_response("registration/register.html", 
                                {'form' : form}, 
                                RequestContext(request))

def accounts(request):
    return render_to_response("registration/accounts.html", 
                                {"createForm": UserCreationForm(),
                                "loginForm": AuthenticationForm() }, 
                                RequestContext(request))