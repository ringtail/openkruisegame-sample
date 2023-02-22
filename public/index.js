$(function() {
  console.log("page init")
  var  value = localStorage.getItem('gscount');
  if(value == undefined ) {
     value = 0 
     localStorage.setItem('gscount',0);
  }

  $( "#progressbar" ).progressbar({
      value: parseInt(value)
  });


  $("#scaleout").click(function(){
      var  value = localStorage.getItem('gscount');
      increase(parseInt(value))
      $.get( "/scaleout", function( data ) {
        alert( "scaleout." );
      });
  })

  $("#scalein").click(function(){
      var  value = localStorage.getItem('gscount');
      decrease(parseInt(value))
      $.get( "/scalein", function( data ) {
        alert( "scalein." );
      });
  })


  function increase(value){
    var timer = setInterval(function(){
      if(value>=100){
        clearInterval(timer)
      }else{
        value = value + Math.random() * 10 
        if(value >= 100){
          value = 100 
        }
        localStorage.setItem('gscount',value);
        $( "#progressbar" ).progressbar({
            value: value
        });
      }
    },1500)
  }


  function decrease(value){
    var timer = setInterval(function(){
      if(value<=0){
        clearInterval(timer)
      }else{
        value = value - Math.random() * 10 
        if(value <= 0){
          value = 0 
        }
        localStorage.setItem('gscount',value);
        $( "#progressbar" ).progressbar({
            value: value
        });
      }
    },300)
  }
});