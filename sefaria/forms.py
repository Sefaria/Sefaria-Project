from django import forms
from django.contrib.auth.models import User
from django.contrib.auth.forms import UserCreationForm
from emailusernames.forms import EmailUserCreationForm
 

class NewUserForm(EmailUserCreationForm):
    first_name = forms.CharField()
    last_name = forms.CharField() 
    
    class Meta:
        model = User
        fields = ("email",)
 
    def __init__(self, *args, **kwargs):
        super(EmailUserCreationForm, self).__init__(*args, **kwargs)
        del self.fields['password2']
        self.fields.keyOrder = ["email", "first_name", "last_name", "password1"]

    def save(self, commit=True):
        user = super(NewUserForm, self).save(commit=False)
        user.first_name = self.cleaned_data["first_name"]
        user.last_name = self.cleaned_data["last_name"]
        if commit:
            user.save()
        return user