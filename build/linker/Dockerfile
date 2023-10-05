ARG SRC_IMG

FROM ${SRC_IMG}  

# Copied from: https://gitlab.com/nvidia/container-images/cuda/-/blob/master/dist/11.8.0/ubuntu2004/devel/Dockerfile
# Env vars have been integrated into the code for readability
# Lines marked 'ADDED' show where this code was modified

ENV DEBIAN_FRONTEND noninteractive
RUN apt-get update --allow-releaseinfo-change \
 && apt-get install --no-install-recommends -y \
    # install essentials
    gnupg2 \
    wget \
    ca-certificates \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# ADDED cuda repo
RUN apt-key del 7fa2af80
ADD https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb .
RUN dpkg -i cuda-keyring_1.0-1_all.deb
RUN apt-key adv --fetch-keys https://developer.download.nvidia.com/compute/cuda/repos/debian10/x86_64/3bf863cc.pub
RUN apt-key adv --fetch-keys https://developer.download.nvidia.com/compute/cuda/repos/debian10/x86_64/7fa2af80.pub

RUN apt-get update -qq \
 && apt-get install --no-install-recommends -y \
    # install cuda toolkit
    cuda-libraries-11-6 \
    libnpp-11-6 \
    cuda-nvtx-11-6 \
    libcublas-11-6 \
    libnccl2 \
    # install cudnn
    libcudnn8=8.4.0.27-1+cuda11.6 \
 && apt-mark hold libcublas-11-6 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# fix issues with shared objects
RUN ls /usr/local/cuda-11.6/targets/x86_64-linux/lib/* | xargs -I{} ln -s {} /usr/lib/x86_64-linux-gnu/ \
 && ln -s libcuda.so /usr/lib/x86_64-linux-gnu/libcuda.so.1 \
 && ln -s libnvidia-ml.so /usr/lib/x86_64-linux-gnu/libnvidia-ml.so.1

ENV LIBRARY_PATH /usr/local/cuda/lib64/stubs
# END COPIED

ENV PATH=/usr/local/nvidia/bin:$PATH
ENV LD_LIBRARY_PATH=/usr/local/nvidia/lib64/
ENV LD_PRELOAD=/usr/local/nvidia/lib64/libnvidia-ml.so

RUN pip install spacy[cuda116]==3.4.1

