<!DOCTYPE html>
<html>
<body>

<p>Change the text of the text field, and then click the button below.</p>

Name: <input type="text" id="myText" value="Mickey">

<p>Note that the default value is not affected when you change the value of the text field.</p>

<button type="button" onclick="myFunction()">Try it</button>
  
<p id="demo"></p>

<script>
function myFunction() {
  var x = document.getElementById("myText");
  var defaultVal = x.defaultValue;
  var currentVal = x.value;
  
  if (defaultVal == currentVal) {
    document.getElementById("demo").innerHTML = "Default value and current value is the same: "
    + x.defaultValue + " and " + x.value
    + "<br>Change the value of the text field to see the difference!";
  } else {
    document.getElementById("demo").innerHTML = "The default value was: " + defaultVal
    + "<br>The new, current value is: " + currentVal;
  }
}
</script>

</body>
</html>


