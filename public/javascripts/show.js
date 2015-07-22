




var loadImage = function() { 
  $.ajax({	url:"/next", 
		cache: false, 
		success :function (result) {
			      	$("#imgroot").attr("src", result.file);
			      	$(".text").html(result.text);
			        setTimeout(loadImage, 10000);
			}
      
    });
};

window.onload = function() {
  loadImage();
  
};